// Google Maps utilities for distance and route calculations

export interface DistanceResult {
  distance: {
    text: string;
    value: number; // meters
  };
  duration: {
    text: string;
    value: number; // seconds
  };
}

export interface GeocodingResult {
  lat: number;
  lng: number;
  formatted_address: string;
  place_id: string;
}

// Calculate distance and duration between two addresses
export async function calculateDistance(
  origin: string,
  destination: string
): Promise<DistanceResult | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn('Google Maps API key not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=imperial&key=${apiKey}`
    );

    const data = await response.json();

    if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
      return {
        distance: data.rows[0].elements[0].distance,
        duration: data.rows[0].elements[0].duration
      };
    }

    return null;
  } catch (error) {
    console.error('Error calculating distance:', error);
    return null;
  }
}

// Geocode an address to get coordinates
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn('Google Maps API key not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    );

    const data = await response.json();

    if (data.status === 'OK' && data.results[0]) {
      const result = data.results[0];
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formatted_address: result.formatted_address,
        place_id: result.place_id
      };
    }

    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

// Get fuzzy location (just city/neighborhood, not exact address)
export function getFuzzyLocation(address: string): string {
  // Simple extraction - take the city name (usually after the first comma)
  const parts = address.split(',');
  if (parts.length >= 2) {
    return parts.slice(0, 2).map(p => p.trim()).join(', ');
  }
  return parts[0].trim();
}

// Calculate estimated price based on distance
export function calculateEstimatedPrice(distanceMeters: number, serviceType: string): number {
  const distanceMiles = distanceMeters / 1609.34;

  // Base rates by service type
  const baseRates = {
    school: 45,
    medical: 35,
    wedding: 100
  };

  const perMileRates = {
    school: 2.5,
    medical: 3.0,
    wedding: 4.0
  };

  const baseRate = baseRates[serviceType as keyof typeof baseRates] || 50;
  const perMile = perMileRates[serviceType as keyof typeof perMileRates] || 3.0;

  return Math.round(baseRate + (distanceMiles * perMile));
}

// Format distance for display
export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

// Format duration for display
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h ${remainingMins}m`;
}
