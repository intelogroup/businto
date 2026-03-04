import { NextRequest, NextResponse } from 'next/server';
import { calculateRoute, geocodeToCoords } from '@/lib/routing';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origin, destination, originLat, originLng, destLat, destLng } = body;

    if ((!origin && !destination) && (!originLat || !originLng || !destLat || !destLng)) {
      return NextResponse.json(
        { error: 'Provide either origin/destination addresses or coordinate pairs' },
        { status: 400 }
      );
    }

    let oLat = originLat, oLng = originLng, dLat = destLat, dLng = destLng;

    // Geocode address strings if coordinates were not provided
    if (!oLat || !oLng) {
      if (!origin) return NextResponse.json({ error: 'Missing origin' }, { status: 400 });
      const coords = await geocodeToCoords(origin);
      if (!coords) return NextResponse.json({ error: 'Could not geocode origin address' }, { status: 400 });
      oLat = coords.lat;
      oLng = coords.lng;
    }

    if (!dLat || !dLng) {
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
