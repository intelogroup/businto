/**
 * Server-side routing utility.
 * Uses OSRM for real driving distance and duration — free, no API key required.
 */

export interface RouteResult {
  distance_miles: number;
  duration_mins: number;
}

/**
 * Calculate driving route between two lat/lng coordinate pairs via OSRM.
 * Returns null on failure — never returns random/mock data.
 */
export async function calculateRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<RouteResult | null> {
  return calculateRouteOSRM(originLat, originLng, destLat, destLng);
}

/**
 * Geocode an address string to lat/lng using Photon (free OpenStreetMap geocoder).
 * Restricted to continental US.
 */
export async function geocodeToCoords(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url =
      `https://photon.komoot.io/api/` +
      `?q=${encodeURIComponent(address)}` +
      `&limit=1&lang=en` +
      `&bbox=-124.848974,24.396308,-66.885444,49.384358`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Businto/1.0 (https://businto.com)' },
      next: { revalidate: 300 },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;

    const [lon, lat] = feature.geometry.coordinates;
    return { lat, lng: lon };
  } catch {
    return null;
  }
}

async function calculateRouteOSRM(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<RouteResult | null> {
  try {
    // OSRM expects longitude,latitude order
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${originLng},${originLat};${destLng},${destLat}` +
      `?overview=false`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Businto/1.0 (https://businto.com)' },
    });

    if (!res.ok) {
      console.error('[routing] OSRM returned', res.status);
      return null;
    }

    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes?.[0]) {
      console.error('[routing] OSRM no route found:', data.code);
      return null;
    }

    const route = data.routes[0];
    return {
      distance_miles: route.distance / 1609.34,
      duration_mins: Math.round(route.duration / 60),
    };
  } catch (err) {
    console.error('[routing] OSRM failed:', err);
    return null;
  }
}
