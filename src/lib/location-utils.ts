/**
 * Masks a full address by stripping sensitive details like house numbers.
 * Focuses on maintaining common area recognition while protecting privacy.
 */
export function obfuscateAddress(address: string, city?: string, state?: string): string {
    if (city && state) {
        return `${city}, ${state}`;
    }

    if (!address) return "";

    // Regular expression to match common house number patterns at the start of the string
    const houseNumberRegex = /^\d+[-\w]*\s+/;
    // Regular expression to match unit/apartment numbers
    const unitRegex = /,\s*(?:Apt|Unit|Suite|Ste|#)\s*[\w\d-]+/gi;

    let masked = address.replace(houseNumberRegex, "");
    masked = masked.replace(unitRegex, "");

    return masked.trim();
}

/**
 * Masks street number with "xxx" while keeping rest of address for operator quotes.
 * Examples: "456 Maple St, Boston, MA" -> "xxx Maple St, Boston, MA"
 */
export function maskStreetNumber(address: string): string {
    if (!address) return "";

    // Regular expression to match house number at the start
    const houseNumberRegex = /^\d+[-\w]*/;
    
    // Replace street number with xxx
    const masked = address.replace(houseNumberRegex, "xxx");
    
    // Remove unit/apartment numbers for privacy
    const unitRegex = /,\s*(?:Apt|Unit|Suite|Ste|#)\s*[\w\d-]+/gi;
    const cleaned = masked.replace(unitRegex, "");

    return cleaned.trim();
}

/**
 * Extracts a "vicinity" string from an address for safer operator display.
 */
export function getVicinity(address: string, city?: string, state?: string): string {
    if (city && state) {
        return `Vicinity of ${city}, ${state}`;
    }

    const masked = obfuscateAddress(address);
    if (!masked) return "Unknown area";

    const parts = masked.split(",").map(p => p.trim());
    if (parts.length >= 2) {
        return `Vicinity of ${parts[0]}, ${parts[1]}`;
    }

    return `Near ${masked}`;
}

/**
 * Calculates straight-line distance between two points using Haversine formula.
 * Result is in miles.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return parseFloat(d.toFixed(1));
}

/**
 * Helper to estimate trip duration based on distance.
 * Simple average speed assumption (30mph for urban/suburban mix).
 */
export function estimateDuration(miles: number): number {
    const averageSpeed = 30; // mph
    const hours = miles / averageSpeed;
    const minutes = Math.ceil(hours * 60) + 5; // Add 5 mins buffer
    return minutes;
}
