import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geocode?q=<query>&limit=5&countrycodes=us
 *
 * Server-side proxy using Photon (komoot) — a free, uncapped geocoding API
 * built on OpenStreetMap data. Avoids CORS issues and Nominatim rate limits.
 *
 * Response is normalized to the Nominatim shape so the frontend needs no changes:
 *   { place_id, display_name, lat, lon }
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");

    if (!q || q.trim().length < 3) {
        return NextResponse.json([], { status: 200 });
    }

    const limit = searchParams.get("limit") ?? "5";
    const countrycodes = searchParams.get("countrycodes") ?? "us";

    // Photon API docs: https://photon.komoot.io/
    // bbox= restricts results to rough continental US bounds
    const photonUrl =
        `https://photon.komoot.io/api/` +
        `?q=${encodeURIComponent(q)}` +
        `&limit=${limit}` +
        `&lang=en` +
        `&bbox=-124.848974,24.396308,-66.885444,49.384358`; // continental US

    try {
        const response = await fetch(photonUrl, {
            headers: {
                "User-Agent": "Businto/1.0 (https://businto.com)",
            },
            next: { revalidate: 60 },
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: "Upstream geocoding service error" },
                { status: response.status }
            );
        }

        const geojson = await response.json();

        // Normalize GeoJSON FeatureCollection → Nominatim-shaped array
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results = (geojson.features ?? []).map((feature: any, idx: number) => {
            const p = feature.properties ?? {};
            const [lon, lat] = feature.geometry?.coordinates ?? [0, 0];

            // Build a human-readable display name from available parts
            const parts: string[] = [];
            if (p.name && p.name !== p.street) parts.push(p.name);
            if (p.housenumber) parts.push(p.housenumber);
            if (p.street) parts.push(p.street);
            if (p.city) parts.push(p.city);
            if (p.state) parts.push(p.state);
            if (p.postcode) parts.push(p.postcode);
            if (p.country) parts.push(p.country);

            return {
                place_id: p.osm_id ?? idx,
                display_name: parts.join(", "),
                lat: String(lat),
                lon: String(lon),
            };
        });

        return NextResponse.json(results);
    } catch (error) {
        console.error("[geocode] Failed to fetch from Photon:", error);
        return NextResponse.json(
            { error: "Failed to reach geocoding service" },
            { status: 502 }
        );
    }
}
