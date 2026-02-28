export interface Quote {
  id: string;
  tripRequestId: string;
  operatorId: string;
  operatorName: string;
  operatorRating: number;
  operatorReviewCount: number;
  operatorAvatar?: string;
  operatorPhone?: string;
  operatorEmail?: string;

  // Pricing
  totalPrice: number;
  baseFare: number;
  distanceCharge: number;
  additionalFees: { name: string; amount: number }[];

  // Vehicle info
  vehicleType: string;
  vehicleYear: number;
  vehicleCapacity: number;
  vehiclePhoto?: string;

  // Operator credentials
  coriCertified: boolean;
  insuranceVerified: boolean;
  wheelchairAccessible: boolean;

  // Quote details
  operatorNote?: string;
  responseTime: number; // in minutes
  estimatedArrivalTime?: string;

  // Status
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: Date;
  expiresAt: Date;

  // Special offers
  isLowestPrice?: boolean;
  isHighestRated?: boolean;
  discount?: { percentage: number; reason: string };
}

export interface TripRequest {
  id: string;
  userId: string;
  service_type: 'school' | 'medical' | 'wedding' | 'general';
  pickup_fuzzy_location: string;
  dropoff_fuzzy_location: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  distance?: number;
  duration?: number;
  pickup_date?: string;
  pickup_time?: string;
  passengers?: number;
  requirements?: {
    wheelchairAccessible?: boolean;
    childSeats?: number;
    luggage?: number;
    [key: string]: unknown;
  };
  status: 'pending' | 'quoted' | 'accepted' | 'completed' | 'cancelled';
  created_at: Date;
  quotes?: Quote[];
}

export type QuoteSortOption = 'price-low' | 'price-high' | 'rating' | 'response-time' | 'distance';

export interface QuoteFilterOptions {
  coriCertified?: boolean;
  wheelchairAccessible?: boolean;
  minRating?: number;
  maxPrice?: number;
}
