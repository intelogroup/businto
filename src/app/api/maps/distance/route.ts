import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { origin, destination } = await request.json();

    if (!origin || !destination) {
      return NextResponse.json(
        { error: 'Missing origin or destination' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      // Return mock data if no API key
      const mockDistance = 5 + Math.random() * 20;
      const mockDuration = mockDistance * 3;

      return NextResponse.json({
        distance: {
          text: `${mockDistance.toFixed(1)} mi`,
          value: Math.round(mockDistance * 1609.34)
        },
        duration: {
          text: `${Math.round(mockDuration)} mins`,
          value: Math.round(mockDuration * 60)
        }
      });
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=imperial&key=${apiKey}`
    );

    const data = await response.json();

    if (data.status !== 'OK' || data.rows[0]?.elements[0]?.status !== 'OK') {
      return NextResponse.json(
        { error: 'Could not calculate distance' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      distance: data.rows[0].elements[0].distance,
      duration: data.rows[0].elements[0].duration,
      origin_address: data.origin_addresses[0],
      destination_address: data.destination_addresses[0]
    });
  } catch (error) {
    console.error('Error calculating distance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
