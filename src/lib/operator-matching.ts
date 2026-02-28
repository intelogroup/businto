import { supabaseAdmin as supabase } from './supabase-server';

// Service type to vehicle type mapping
export const SERVICE_VEHICLE_MAP: Record<string, string[]> = {
  school: ['school_bus', 'mini_bus', 'van'],
  medical: ['van', 'wheelchair_van', 'sedan'],
  wedding: ['coach', 'mini_bus', 'suv', 'sedan', 'limo', 'party_bus'],
  corporate: ['coach', 'mini_bus', 'sedan', 'suv']
};

// Service type to specialty mapping
export const SERVICE_SPECIALTY_MAP: Record<string, string> = {
  school: 'School Routes',
  medical: 'Medical Transport',
  wedding: 'Event Shuttles',
  corporate: 'Corporate Travel'
};

export interface MatchingRequest {
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
  company_phone?: string; // Added for SMS notifications
  rating: number;
  service_areas: string[];
  vehicle_types: string[];
  specialties: string[];
  base_rate_per_mile: number;
  is_partner?: boolean; // Added for priority logic
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
 * Calculate distance between two points using Haversine formula (Miles)
 * This avoids external API calls/costs and provides instant, uncapped calculations.
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

  // Priority boost for partners (+10 points)
  const partnerBoost = operator.is_partner ? 10 : 0;

  // Weighted average
  const baseScore = (
    distanceScore * 0.4 +      // 40% weight on proximity
    ratingScore * 0.3 +         // 30% weight on quality
    responseScore * 0.2 +       // 20% weight on speed
    acceptanceScore * 0.1       // 10% weight on reliability
  );

  return Math.max(0, baseScore - capacityPenalty + partnerBoost);
}

/**
 * Geocode address using our internal Photon/OSM proxy
 * @param address Address to geocode
 * @returns Coordinates or null
 */
async function geocodeAddressInternal(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://businto.com';
    const response = await fetch(
      `${baseUrl}/api/geocode?q=${encodeURIComponent(address)}&limit=1`
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data && data[0] && data[0].lat && data[0].lon) {
      return { 
        lat: parseFloat(data[0].lat), 
        lng: parseFloat(data[0].lon) 
      };
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
        const coords = await geocodeAddressInternal(address);
        if (coords) {
          pickup_lat = coords.lat;
          pickup_lng = coords.lng;
          console.log(`Geocoded ${address} to (${pickup_lat}, ${pickup_lng})`);
        }
      }
    }

    // Extract state from pickup address for fallback
    const state = extractState(pickup_address || pickup_fuzzy);
    console.log(`Matching state: ${state || 'None'} for address: ${pickup_address || pickup_fuzzy}`);

    // Get required vehicle types for this service
    const requiredVehicles = SERVICE_VEHICLE_MAP[service_type] || [];
    console.log(`Required vehicles for ${service_type}: ${requiredVehicles.join(', ')}`);

    // Build the query - get more fields for scoring
    let query = supabase
      .from('operators')
      .select(`
        id, 
        profile_id, 
        company_name, 
        company_email, 
        company_phone,
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
        active_quotes_count,
        is_partner
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
      console.log(`Filtering by specialty: ${specialty}`);
      query = query.contains('specialties', [specialty]);
    }

    // Execute query
    const { data: operators, error } = await query;

    if (error) {
      console.error('Error querying operators:', error);
      throw error;
    }

    console.log(`Initial query found ${operators?.length || 0} active verified operators.`);

    if (!operators || operators.length === 0) {
      console.log('No matching operators found for request specialty/area');
      return [];
    }

    // Filter by vehicle types
    let matchedOperators = operators.filter(operator => {
      const hasMatchingVehicle = operator.vehicle_types.some((vt: string) =>
        requiredVehicles.includes(vt)
      );
      return hasMatchingVehicle;
    });

    console.log(`Found ${matchedOperators.length} operators matching vehicle requirements`);

    // Strictly filter operators based on specialized conditions
    if (metadata && Object.keys(metadata).length > 0) {
      matchedOperators = matchedOperators.filter(operator => {
        const opSpecialties = operator.specialties || [];

        if (service_type === 'medical') {
          // Mobility checks
          if (['wheelchair', 'manual-wheelchair', 'electric-wheelchair'].includes(metadata.mobility_level) && !opSpecialties.includes('Wheelchair')) return false;
          if (metadata.mobility_level === 'stretcher' && !opSpecialties.includes('Stretcher')) return false;

          // Service level checks
          if (metadata.service_level === 'door-through-door' && !opSpecialties.includes('Door-Through-Door')) return false;
          if (metadata.service_level === 'white-glove' && !opSpecialties.includes('White Glove')) return false;

          // Boolean checks (robust check for both boolean and string)
          const needsOxygen = metadata.oxygen_use === true || metadata.oxygen_use === 'yes' || metadata.oxygen_use === 'true' || metadata.oxygen_required === true;
          if (needsOxygen && !opSpecialties.includes('Oxygen') && !opSpecialties.includes('Portable Oxygen')) return false;

          const isBariatric = metadata.is_bariatric === true || metadata.is_bariatric === 'yes' || metadata.is_bariatric === 'true';
          if (isBariatric && !opSpecialties.includes('Bariatric')) return false;

          const needsServiceAnimal = metadata.service_animal === true || metadata.service_animal === 'yes' || metadata.service_animal === 'true';
          if (needsServiceAnimal && !opSpecialties.includes('Service Animal')) return false;
        }

        if (service_type === 'school') {
          if ((metadata.special_needs === 'yes' || metadata.special_needs === true) && !opSpecialties.includes('Special Needs')) return false;
          if (['booster', 'forward-facing'].includes(metadata.booster_seat) && !opSpecialties.includes('Booster Seat')) return false;
          if ((metadata.no_adult_release === 'yes' || metadata.no_adult_release === true) && !opSpecialties.includes('No-Adult Release')) return false;
        }

        // Handle Immediate Availability (robust check for both boolean and string)
        const isImmediate = metadata.is_immediate === true || metadata.is_immediate === 'yes' || metadata.is_immediate === 'true';
        if (isImmediate && !opSpecialties.includes('Immediate Availability')) return false;

        return true;
      });
      console.log(`After strict condition filtering: ${matchedOperators.length} operators remain`);
    }

    // Distance-based filtering and scoring if we have coordinates
    if (pickup_lat && pickup_lng) {
      console.log(`Calculating distances for ${matchedOperators.length} operators from (${pickup_lat}, ${pickup_lng})`);

      const operatorsWithDistance = matchedOperators
        .map(operator => {
          // If operator has no location, we give them a high distance but don't filter out yet
          if (!operator.company_lat || !operator.company_lng) {
            return { ...operator, distance: 999, score: (operator.rating || 0) * 10 };
          }

          // Calculate distance
          const distance = calculateDistance(
            Number(pickup_lat),
            Number(pickup_lng),
            Number(operator.company_lat),
            Number(operator.company_lng)
          );

          const score = calculateScore(operator, distance);

          return {
            ...operator,
            distance: Math.round(distance * 10) / 10,
            score: Math.round(score * 10) / 10
          };
        });

      // Filter by radius, but keep those without coordinates as low-priority fallback
      matchedOperators = operatorsWithDistance
        .filter(op => op.distance === 999 || op.distance <= (op.service_radius_miles || 50))
        .sort((a, b) => {
          // Sort by score (descending), then distance (ascending)
          if (b.score !== a.score) {
            return (b.score || 0) - (a.score || 0);
          }
          return (a.distance || 0) - (b.distance || 0);
        })
        .slice(0, 7);

      console.log(`Matching complete. Found ${matchedOperators.length} operators.`);
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
    if (metadata.mobility_level) requirements.push(`Mobility: ${metadata.mobility_level.replace('-', ' ')}`);
    if (metadata.service_level) requirements.push(`Service: ${metadata.service_level.replace(/-/g, ' ')}`);
    if (metadata.stair_factor && metadata.stair_factor !== 'none') requirements.push(`Stairs: ${metadata.stair_factor}`);
    if (metadata.oxygen_required || metadata.oxygen_use) requirements.push('Portable Oxygen');
    if (metadata.is_bariatric) requirements.push('Bariatric (250+ lbs)');
    if (metadata.service_animal) requirements.push('Service Animal');
    if (metadata.additional_passengers) requirements.push(`+${metadata.additional_passengers} Escort(s)`);
    if (metadata.return_status) requirements.push(`Return: ${metadata.return_status}`);
  } else if (service_type === 'wedding') {
    if (metadata.event_category) requirements.push(`Category: ${metadata.event_category}`);
    if (metadata.guest_count) requirements.push(`${metadata.guest_count} guests`);
    if (metadata.vehicle_style) requirements.push(`Vehicle: ${metadata.vehicle_style}`);
    if (metadata.itinerary_type) requirements.push(`Itinerary: ${metadata.itinerary_type}`);
    if (metadata.shuttle_mode) requirements.push(`Mode: ${metadata.shuttle_mode.replace('-', ' ')}`);
    if (metadata.event_start_time) requirements.push(`Event Start: ${metadata.event_start_time}`);

    // Amenities
    const amenities = [];
    if (metadata.alcohol_allowed) amenities.push('Alcohol OK');
    if (metadata.refreshments_provided) amenities.push('Refreshments');
    if (metadata.av_needs) amenities.push('AV/Bluetooth');
    if (metadata.special_decor) amenities.push('Custom Decor');
    if (amenities.length > 0) requirements.push(`Amenities: ${amenities.join(', ')}`);
  }

  // Add note if provided (applies to all service types)
  if (metadata.note) requirements.push(metadata.note);

  return requirements;
}
