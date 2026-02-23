import { supabase } from './supabase';

// Service type to vehicle type mapping
export const SERVICE_VEHICLE_MAP: Record<string, string[]> = {
  school: ['school_bus', 'mini_bus', 'van'],
  medical: ['van', 'wheelchair_van', 'sedan'],
  wedding: ['coach', 'mini_bus', 'suv', 'sedan', 'limo', 'party_bus']
};

// Service type to specialty mapping
export const SERVICE_SPECIALTY_MAP: Record<string, string> = {
  school: 'School Routes',
  medical: 'Medical Transport',
  wedding: 'Event Shuttles'
};

interface MatchingRequest {
  service_type: 'school' | 'medical' | 'wedding';
  pickup_address?: string;
  pickup_fuzzy?: string;
  dropoff_address?: string;
  dropoff_fuzzy?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  metadata?: any;
}

interface MatchedOperator {
  id: string;
  profile_id: string;
  company_name: string;
  company_email: string;
  rating: number;
  service_areas: string[];
  vehicle_types: string[];
  specialties: string[];
  base_rate_per_mile: number;
  distance?: number;
  score?: number;
  company_lat?: number;
  company_lng?: number;
  service_radius_miles?: number;
  response_time_avg_mins?: number;
  acceptance_rate?: number;
  active_quotes_count?: number;
}

/**
 * Calculate distance between two points using Haversine formula
 * @param lat1 Latitude of point 1
 * @param lng1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lng2 Longitude of point 2
 * @returns Distance in miles
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate operator matching score
 * @param operator Operator details
 * @param distance Distance from pickup location
 * @returns Score from 0-100
 */
function calculateScore(operator: MatchedOperator, distance: number): number {
  const serviceRadius = operator.service_radius_miles || 50;
  
  // Distance score (closer = better, 0 miles = 100 pts, at radius = 0 pts)
  const distanceScore = Math.max(0, 100 - (distance / serviceRadius * 100));
  
  // Rating score (4.0 = 80 pts, 5.0 = 100 pts)
  const ratingScore = ((operator.rating || 4.0) / 5.0) * 100;
  
  // Response time score (0-15 min = 100 pts, 15-120 min = 100-0 pts)
  const responseTime = operator.response_time_avg_mins || 30;
  const responseScore = Math.max(0, 100 - (responseTime / 120 * 100));
  
  // Acceptance rate score (already a percentage)
  const acceptanceScore = operator.acceptance_rate || 50;
  
  // Capacity penalty (>10 active quotes = reduce score)
  const activeQuotes = operator.active_quotes_count || 0;
  const capacityPenalty = activeQuotes > 10 ? (activeQuotes - 10) * 5 : 0;
  
  // Weighted average
  const baseScore = (
    distanceScore * 0.4 +      // 40% weight on proximity
    ratingScore * 0.3 +         // 30% weight on quality
    responseScore * 0.2 +       // 20% weight on speed
    acceptanceScore * 0.1       // 10% weight on reliability
  );
  
  return Math.max(0, baseScore - capacityPenalty);
}

/**
 * Geocode address using Google Maps API or existing endpoint
 * @param address Address to geocode
 * @returns Coordinates or null
 */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Use your existing maps API endpoint
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://businto.vercel.app'}/api/maps/geocode?address=${encodeURIComponent(address)}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.lat && data.lng) {
      return { lat: data.lat, lng: data.lng };
    }
    
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Extract state/region from address string
 * @param address Full address or fuzzy address
 * @returns State abbreviation (e.g., 'MA', 'NH')
 */
function extractState(address?: string): string | null {
  if (!address) return null;
  
  // Common state patterns: "City, MA" or "City, Massachusetts"
  const stateMatch = address.match(/,\s*([A-Z]{2})\b/);
  if (stateMatch) return stateMatch[1];
  
  // Full state names to abbreviations
  const stateMap: Record<string, string> = {
    'Massachusetts': 'MA',
    'New Hampshire': 'NH',
    'Rhode Island': 'RI',
    'Connecticut': 'CT',
    'Vermont': 'VT',
    'Maine': 'ME',
    'New York': 'NY'
  };
  
  for (const [fullName, abbr] of Object.entries(stateMap)) {
    if (address.includes(fullName)) return abbr;
  }
  
  return null;
}

/**
 * Find operators that match the transport request criteria
 * @param request Transport request details
 * @returns Array of matching operators (top 7 by score)
 */
export async function findMatchingOperators(
  request: MatchingRequest
): Promise<MatchedOperator[]> {
  try {
    const { service_type, pickup_address, pickup_fuzzy, metadata } = request;
    let { pickup_lat, pickup_lng } = request;
    
    // Geocode pickup address if coordinates not provided
    if (!pickup_lat || !pickup_lng) {
      const address = pickup_address || pickup_fuzzy;
      if (address) {
        const coords = await geocodeAddress(address);
        if (coords) {
          pickup_lat = coords.lat;
          pickup_lng = coords.lng;
          console.log(`Geocoded ${address} to (${pickup_lat}, ${pickup_lng})`);
        }
      }
    }
    
    // Extract state from pickup address for fallback
    const state = extractState(pickup_address || pickup_fuzzy);
    if (!state && !pickup_lat) {
      console.warn('Could not extract state or geocode address:', pickup_address);
    }

    // Get required vehicle types for this service
    const requiredVehicles = SERVICE_VEHICLE_MAP[service_type] || [];
    
    // Build the query - get more fields for scoring
    let query = supabase
      .from('operators')
      .select(`
        id, 
        profile_id, 
        company_name, 
        company_email, 
        rating, 
        service_areas, 
        vehicle_types, 
        specialties, 
        base_rate_per_mile,
        company_lat,
        company_lng,
        service_radius_miles,
        response_time_avg_mins,
        acceptance_rate,
        active_quotes_count
      `)
      .eq('is_verified', true)
      .eq('is_active', true)
      .eq('is_accepting_requests', true);

    // Filter by service area if we have a state
    if (state) {
      query = query.contains('service_areas', [state]);
    }

    // Filter by specialty
    const specialty = SERVICE_SPECIALTY_MAP[service_type];
    if (specialty) {
      query = query.contains('specialties', [specialty]);
    }

    // Execute query
    const { data: operators, error } = await query;

    if (error) {
      console.error('Error querying operators:', error);
      throw error;
    }

    if (!operators || operators.length === 0) {
      console.log('No matching operators found for request');
      return [];
    }

    // Filter by vehicle types
    let matchedOperators = operators.filter(operator => {
      const hasMatchingVehicle = operator.vehicle_types.some((vt: string) => 
        requiredVehicles.includes(vt)
      );
      return hasMatchingVehicle;
    });

    console.log(`Found ${matchedOperators.length} operators matching service/vehicle requirements`);

    // Distance-based filtering and scoring if we have coordinates
    if (pickup_lat && pickup_lng) {
      matchedOperators = matchedOperators
        .filter(operator => {
          // Filter out operators without location
          if (!operator.company_lat || !operator.company_lng) {
            return false;
          }
          
          // Calculate distance
          const distance = calculateDistance(
            pickup_lat,
            pickup_lng,
            operator.company_lat,
            operator.company_lng
          );
          
          // Check if within service radius
          const radius = operator.service_radius_miles || 50;
          return distance <= radius;
        })
        .map(operator => {
          // Calculate distance and score for each operator
          const distance = calculateDistance(
            pickup_lat!,
            pickup_lng!,
            operator.company_lat!,
            operator.company_lng!
          );
          
          const score = calculateScore(operator, distance);
          
          return {
            ...operator,
            distance: Math.round(distance * 10) / 10, // Round to 1 decimal
            score: Math.round(score * 10) / 10
          };
        })
        .sort((a, b) => {
          // Sort by score (descending), then distance (ascending)
          if (b.score !== a.score) {
            return (b.score || 0) - (a.score || 0);
          }
          return (a.distance || 0) - (b.distance || 0);
        })
        .slice(0, 7); // Top 7 operators

      console.log(`After distance filtering: ${matchedOperators.length} operators within service radius`);
      if (matchedOperators.length > 0) {
        console.log(`Top matches:`, matchedOperators.slice(0, 3).map((op: any) => ({
          name: op.company_name,
          distance: op.distance ? `${op.distance}mi` : 'N/A',
          score: op.score || 0,
          rating: op.rating
        })));
      }
    } else {
      // Fallback: No geocoding - just sort by rating and limit
      console.log('No coordinates available - falling back to rating-based matching');
      matchedOperators = matchedOperators
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 10); // Be more generous without distance filtering
    }
    
    return matchedOperators;
  } catch (error) {
    console.error('Error in findMatchingOperators:', error);
    return [];
  }
}

/**
 * Get additional requirements from metadata for display in emails
 * @param service_type Type of service
 * @param metadata Request metadata
 * @returns Array of requirement strings
 */
export function extractRequirements(
  service_type: string,
  metadata: any = {}
): string[] {
  const requirements: string[] = [];

  if (service_type === 'school') {
    if (metadata.student_count) requirements.push(`${metadata.student_count} students`);
    if (metadata.grade_level) requirements.push(`Grade level: ${metadata.grade_level}`);
    if (metadata.schedule_type) requirements.push(`Schedule: ${metadata.schedule_type}`);
    if (metadata.special_needs) requirements.push(`Special needs: ${metadata.special_needs}`);
  } else if (service_type === 'medical') {
    if (metadata.mobility_level) requirements.push(`Mobility: ${metadata.mobility_level}`);
    if (metadata.service_level) requirements.push(`Service level: ${metadata.service_level}`);
    if (metadata.wheelchair_type) requirements.push(`Wheelchair: ${metadata.wheelchair_type}`);
    if (metadata.oxygen_required) requirements.push('Oxygen required');
  } else if (service_type === 'wedding') {
    if (metadata.guest_count) requirements.push(`${metadata.guest_count} guests`);
    if (metadata.vehicle_style) requirements.push(`Vehicle: ${metadata.vehicle_style}`);
    if (metadata.itinerary_type) requirements.push(`Type: ${metadata.itinerary_type}`);
  }

  // Add note if provided (applies to all service types)
  if (metadata.note) requirements.push(metadata.note);

  return requirements;
}
