import { NextRequest, NextResponse } from 'next/server';
import { calculateRoute, geocodeToCoords } from '@/lib/routing';
import { parseCoordinate, parseTextField } from '@/lib/boundary';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

// BOUNDARY (BUS-MAPS-DISTANCE-COST-001): this route is
// unauthenticated and fans out to upstream services (geocodeToCoords
// x2 + calculateRoute per call), so volume is bounded per client IP
// here instead of by auth — the same checkRateLimit discipline as
// /api/geocode (BUS-GEOCODE-COST-001). The limit is 20/min rather
// than geocode's 30 because one distance call can cost three
// upstream calls; the address-length bound mirrors geocode's
// 500-char query cap.
const DISTANCE_RATE_LIMIT = 20;
const DISTANCE_RATE_WINDOW_MS = 60 * 1000;
const DISTANCE_MAX_ADDRESS_CHARS = 500;

export async function POST(request: NextRequest) {
  try {
    // Throttle FIRST (BUS-MAPS-DISTANCE-COST-001): refused and
    // malformed calls burn budget too, so hostile shapes cannot
    // probe the validation boundary for free at unlimited rate.
    if (!checkRateLimit(`maps-distance:${getClientIP(request)}`, DISTANCE_RATE_LIMIT, DISTANCE_RATE_WINDOW_MS)) {
      return NextResponse.json(
        { error: 'Too many distance requests' },
        { status: 429 }
      );
    }

    const body = (await request.json()) ?? {};
    const { origin, destination, originLat, originLng, destLat, destLng } = body;

    // BOUNDARY (BUS-MAPS-DISTANCE-COORD-SHAPE-001): every coordinate
    // that ARRIVED is parsed by parseCoordinate before anything
    // consumes it — a finite number in range, or the request is
    // refused 400. The old truthiness checks forwarded strings,
    // arrays, objects and out-of-range numbers to calculateRoute
    // verbatim, and treated a legitimate 0 (equator / prime meridian)
    // as missing. An absent coordinate stays absent (undefined) and
    // falls back to geocoding its address, as before.
    const parsedOriginLat = originLat === undefined ? null : parseCoordinate(originLat, 'originLat', 'latitude');
    const parsedOriginLng = originLng === undefined ? null : parseCoordinate(originLng, 'originLng', 'longitude');
    const parsedDestLat = destLat === undefined ? null : parseCoordinate(destLat, 'destLat', 'latitude');
    const parsedDestLng = destLng === undefined ? null : parseCoordinate(destLng, 'destLng', 'longitude');
    for (const parsed of [parsedOriginLat, parsedOriginLng, parsedDestLat, parsedDestLng]) {
      if (parsed && !parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
    }

    const coordValue = (parsed: typeof parsedOriginLat): number | undefined =>
      parsed && parsed.ok ? parsed.value : undefined;
    let oLat = coordValue(parsedOriginLat);
    let oLng = coordValue(parsedOriginLng);
    let dLat = coordValue(parsedDestLat);
    let dLng = coordValue(parsedDestLng);

    if (oLat === undefined && oLng === undefined && dLat === undefined && dLng === undefined && !origin && !destination) {
      return NextResponse.json(
        { error: 'Provide either origin/destination addresses or coordinate pairs' },
        { status: 400 }
      );
    }

    // Geocode address strings for whichever side lacks a full pair.
    // BOUNDARY (BUS-MAPS-DISTANCE-ADDRESS-SHAPE-001): an address
    // that is about to be geocoded is parsed by parseTextField
    // first — a string before it reaches geocodeToCoords, mirroring
    // parseCoordinate for the coordinate legs. The old truthiness
    // check forwarded numbers, booleans, arrays and objects
    // verbatim, and encodeURIComponent coerced them into plausible
    // Photon queries ('12345', '[object Object]'). An address whose
    // side has a full coordinate pair is never consumed and stays
    // inert, exactly as before.
    // BOUNDARY (BUS-MAPS-DISTANCE-COST-001): the address forwarded
    // upstream is length-bounded — an unbounded address proxies
    // caller-sized input to Photon verbatim.
    if (oLat === undefined || oLng === undefined) {
      if (!origin) return NextResponse.json({ error: 'Missing origin' }, { status: 400 });
      const parsedOrigin = parseTextField(origin, 'origin');
      if (!parsedOrigin.ok) {
        return NextResponse.json({ error: parsedOrigin.error }, { status: 400 });
      }
      if (parsedOrigin.value.length > DISTANCE_MAX_ADDRESS_CHARS) {
        return NextResponse.json({ error: 'Origin address is too long' }, { status: 400 });
      }
      const coords = await geocodeToCoords(parsedOrigin.value);
      if (!coords) return NextResponse.json({ error: 'Could not geocode origin address' }, { status: 400 });
      oLat = coords.lat;
      oLng = coords.lng;
    }

    if (dLat === undefined || dLng === undefined) {
      if (!destination) return NextResponse.json({ error: 'Missing destination' }, { status: 400 });
      const parsedDestination = parseTextField(destination, 'destination');
      if (!parsedDestination.ok) {
        return NextResponse.json({ error: parsedDestination.error }, { status: 400 });
      }
      if (parsedDestination.value.length > DISTANCE_MAX_ADDRESS_CHARS) {
        return NextResponse.json({ error: 'Destination address is too long' }, { status: 400 });
      }
      const coords = await geocodeToCoords(parsedDestination.value);
      if (!coords) return NextResponse.json({ error: 'Could not geocode destination address' }, { status: 400 });
      dLat = coords.lat;
      dLng = coords.lng;
    }

    const result = await calculateRoute(oLat, oLng, dLat, dLng);

    if (!result) {
      return NextResponse.json({ error: 'Could not calculate route' }, { status: 502 });
    }

    const distanceMeters = Math.round(result.distance_miles * 1609.34);
    const durationSeconds = result.duration_mins * 60;

    return NextResponse.json({
      distance: {
        text: `${result.distance_miles.toFixed(1)} mi`,
        value: distanceMeters,
      },
      duration: {
        text: result.duration_mins < 60
          ? `${result.duration_mins} mins`
          : `${Math.floor(result.duration_mins / 60)}h ${result.duration_mins % 60}m`,
        value: durationSeconds,
      },
    });
  } catch (error) {
    console.error('[api/maps/distance] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
