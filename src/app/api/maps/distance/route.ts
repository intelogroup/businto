import { NextRequest, NextResponse } from 'next/server';
import { calculateRoute, geocodeToCoords } from '@/lib/routing';
import { parseCoordinate } from '@/lib/boundary';

export async function POST(request: NextRequest) {
  try {
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
    if (oLat === undefined || oLng === undefined) {
      if (!origin) return NextResponse.json({ error: 'Missing origin' }, { status: 400 });
      const coords = await geocodeToCoords(origin);
      if (!coords) return NextResponse.json({ error: 'Could not geocode origin address' }, { status: 400 });
      oLat = coords.lat;
      oLng = coords.lng;
    }

    if (dLat === undefined || dLng === undefined) {
      if (!destination) return NextResponse.json({ error: 'Missing destination' }, { status: 400 });
      const coords = await geocodeToCoords(destination);
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
