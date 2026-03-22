import { describe, it, expect } from 'vitest';

/**
 * Customer Trip History — Logic Tests
 *
 * Validates the trip list categorization, filtering, and display logic:
 * - Active vs past trip classification
 * - Service type filtering
 * - Booking data display (operator name, cost)
 */

describe('Trip History — Status Classification', () => {
  const isActiveTrip = (status: string) => !['completed', 'cancelled'].includes(status);
  const isPastTrip = (status: string) => ['completed', 'cancelled'].includes(status);

  it('should classify pending as active', () => {
    expect(isActiveTrip('pending')).toBe(true);
  });

  it('should classify booked as active', () => {
    expect(isActiveTrip('booked')).toBe(true);
  });

  it('should classify in-progress as active', () => {
    expect(isActiveTrip('in-progress')).toBe(true);
  });

  it('should classify completed as past', () => {
    expect(isPastTrip('completed')).toBe(true);
  });

  it('should classify cancelled as past', () => {
    expect(isPastTrip('cancelled')).toBe(true);
  });

  it('should classify quoted as active', () => {
    expect(isActiveTrip('quoted')).toBe(true);
  });
});

describe('Trip History — Service Type Filtering', () => {
  const trips = [
    { id: '1', service_type: 'school', status: 'completed' },
    { id: '2', service_type: 'medical', status: 'booked' },
    { id: '3', service_type: 'wedding', status: 'pending' },
    { id: '4', service_type: 'medical', status: 'completed' },
  ];

  it('should return all trips when filter is "all"', () => {
    const filter = 'all';
    const filtered = filter === 'all' ? trips : trips.filter(t => t.service_type === filter);
    expect(filtered.length).toBe(4);
  });

  it('should filter medical trips', () => {
    const filter = 'medical';
    const filtered = trips.filter(t => t.service_type === filter);
    expect(filtered.length).toBe(2);
  });

  it('should filter school trips', () => {
    const filter = 'school';
    const filtered = trips.filter(t => t.service_type === filter);
    expect(filtered.length).toBe(1);
  });

  it('should filter wedding trips', () => {
    const filter = 'wedding';
    const filtered = trips.filter(t => t.service_type === filter);
    expect(filtered.length).toBe(1);
  });
});

describe('Trip History — Booking Data Display', () => {
  it('should display operator name when booking exists', () => {
    const trip = {
      id: 'trip-1',
      bookings: [{
        id: 'b-1',
        status: 'confirmed',
        total_cost: 150.00,
        operator: { company_name: 'SafeRide Medical Transport' },
      }],
    };

    expect(trip.bookings[0].operator?.company_name).toBe('SafeRide Medical Transport');
  });

  it('should display cost when booking has total_cost', () => {
    const trip = {
      id: 'trip-1',
      bookings: [{
        id: 'b-1',
        status: 'confirmed',
        total_cost: 250.50,
        operator: { company_name: 'Boston Care Rides' },
      }],
    };

    expect(trip.bookings[0].total_cost).toBe(250.50);
    expect(trip.bookings[0].total_cost!.toFixed(2)).toBe('250.50');
  });

  it('should handle trips without bookings gracefully', () => {
    const trip = {
      id: 'trip-2',
      bookings: [] as any[],
    };

    const firstBooking = trip.bookings?.[0];
    expect(firstBooking).toBeUndefined();
  });

  it('should handle bookings without operator gracefully', () => {
    const trip = {
      id: 'trip-3',
      bookings: [{
        id: 'b-2',
        status: 'confirmed',
        total_cost: null,
        operator: null,
      }],
    };

    expect(trip.bookings[0].operator?.company_name).toBeUndefined();
    expect(trip.bookings[0].total_cost).toBeNull();
  });
});
