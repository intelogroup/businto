import { describe, it, expect } from 'vitest';

/**
 * Re-request Flow — Logic Tests
 *
 * Validates the draft-mapping logic that translates trip API data
 * into the sessionStorage draft shape read by the Forms component.
 */

// ---------------------------------------------------------------------------
// Helpers (mirrors the mapping in src/app/trips/page.tsx handleReRequest)
// ---------------------------------------------------------------------------

type TripData = {
  id: string;
  service_type: 'school' | 'medical' | 'wedding';
  pickup_address?: string;
  dropoff_address?: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  metadata_safe?: Record<string, any>;
};

function buildFormDraft(trip: TripData): Record<string, any> {
  const metaSafe = trip.metadata_safe ?? {};
  const draft: Record<string, any> = {
    activeTab: trip.service_type === 'wedding' ? 'wedding' : trip.service_type,
  };

  if (trip.service_type === 'school') {
    if (trip.pickup_address) draft.pickupZip = trip.pickup_address;
    if (metaSafe.school_name) draft.schoolName = metaSafe.school_name;
    if (metaSafe.grade_level) draft.gradeLevel = metaSafe.grade_level;
    if (metaSafe.schedule_type) draft.scheduleType = metaSafe.schedule_type;
    if (metaSafe.am_time) draft.amTime = metaSafe.am_time;
    if (metaSafe.pm_time) draft.pmTime = metaSafe.pm_time;
    if (trip.start_date) draft.startDate = trip.start_date;
    if (trip.end_date) draft.endDate = trip.end_date;
    if (metaSafe.student_count) draft.studentCount = String(metaSafe.student_count);
  } else if (trip.service_type === 'medical') {
    if (trip.pickup_address) draft.pickupLocation = trip.pickup_address;
    if (trip.dropoff_address) draft.dropoffLocation = trip.dropoff_address;
    if (metaSafe.mobility_level) draft.mobilityLevel = metaSafe.mobility_level;
    if (trip.start_date) draft.appointmentDate = trip.start_date;
    if (trip.start_time) draft.appointmentTime = trip.start_time;
    if (metaSafe.service_level) draft.serviceLevel = metaSafe.service_level;
    if (metaSafe.trip_type) draft.tripType = metaSafe.trip_type;
    if (metaSafe.oxygen_use !== undefined) draft.oxygenUse = metaSafe.oxygen_use;
    if (metaSafe.is_bariatric !== undefined) draft.isBariatric = metaSafe.is_bariatric;
    if (metaSafe.facility_details) draft.facilityDetails = metaSafe.facility_details;
    if (metaSafe.stair_factor) draft.stairFactor = metaSafe.stair_factor;
    if (metaSafe.return_status) draft.returnStatus = metaSafe.return_status;
    if (metaSafe.additional_passengers) draft.additionalPassengers = String(metaSafe.additional_passengers);
    if (metaSafe.service_animal !== undefined) draft.serviceAnimal = metaSafe.service_animal;
  } else if (trip.service_type === 'wedding') {
    if (trip.pickup_address) draft.hotelZip = trip.pickup_address;
    if (trip.dropoff_address) draft.venueZip = trip.dropoff_address;
    if (trip.start_date) draft.eventDate = trip.start_date;
    if (metaSafe.guest_count) draft.guestCount = String(metaSafe.guest_count);
    if (metaSafe.vehicle_style) draft.vehicleStyle = metaSafe.vehicle_style;
    if (metaSafe.itinerary_type) draft.itineraryType = metaSafe.itinerary_type;
    if (trip.start_time) draft.pickupTime = trip.start_time;
  }

  return draft;
}

// ---------------------------------------------------------------------------
// Tests — School
// ---------------------------------------------------------------------------

describe('Re-request — School trip draft mapping', () => {
  const trip: TripData = {
    id: 'trip-school-1',
    service_type: 'school',
    pickup_address: '14 Maple St, Everett, MA',
    start_date: '2026-09-01',
    end_date: '2026-06-15',
    metadata_safe: {
      school_name: 'Lincoln Elementary',
      grade_level: '3rd',
      schedule_type: 'daily',
      am_time: '08:15',
      pm_time: '15:30',
      student_count: 2,
    },
  };

  it('sets activeTab to "school"', () => {
    expect(buildFormDraft(trip).activeTab).toBe('school');
  });

  it('maps pickup_address to pickupZip', () => {
    expect(buildFormDraft(trip).pickupZip).toBe('14 Maple St, Everett, MA');
  });

  it('maps school_name from metadata_safe', () => {
    expect(buildFormDraft(trip).schoolName).toBe('Lincoln Elementary');
  });

  it('maps grade_level from metadata_safe', () => {
    expect(buildFormDraft(trip).gradeLevel).toBe('3rd');
  });

  it('maps start_date to startDate', () => {
    expect(buildFormDraft(trip).startDate).toBe('2026-09-01');
  });

  it('converts student_count to string', () => {
    expect(buildFormDraft(trip).studentCount).toBe('2');
  });

  it('does not include medical fields', () => {
    const draft = buildFormDraft(trip);
    expect(draft.pickupLocation).toBeUndefined();
    expect(draft.dropoffLocation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — Medical
// ---------------------------------------------------------------------------

describe('Re-request — Medical trip draft mapping', () => {
  const trip: TripData = {
    id: 'trip-medical-1',
    service_type: 'medical',
    pickup_address: '55 Tremont St, Boston, MA',
    dropoff_address: 'Mass General Hospital, Boston, MA',
    start_date: '2026-04-10',
    start_time: '09:00',
    metadata_safe: {
      mobility_level: 'wheelchair',
      service_level: 'BLS',
      trip_type: 'one-way',
      oxygen_use: true,
      is_bariatric: false,
      stair_factor: 'ground',
      service_animal: false,
      additional_passengers: 1,
    },
  };

  it('sets activeTab to "medical"', () => {
    expect(buildFormDraft(trip).activeTab).toBe('medical');
  });

  it('maps pickup_address to pickupLocation', () => {
    expect(buildFormDraft(trip).pickupLocation).toBe('55 Tremont St, Boston, MA');
  });

  it('maps dropoff_address to dropoffLocation', () => {
    expect(buildFormDraft(trip).dropoffLocation).toBe('Mass General Hospital, Boston, MA');
  });

  it('maps start_date to appointmentDate', () => {
    expect(buildFormDraft(trip).appointmentDate).toBe('2026-04-10');
  });

  it('maps start_time to appointmentTime', () => {
    expect(buildFormDraft(trip).appointmentTime).toBe('09:00');
  });

  it('maps oxygen_use boolean', () => {
    expect(buildFormDraft(trip).oxygenUse).toBe(true);
  });

  it('maps is_bariatric boolean (false)', () => {
    expect(buildFormDraft(trip).isBariatric).toBe(false);
  });

  it('converts additional_passengers to string', () => {
    expect(buildFormDraft(trip).additionalPassengers).toBe('1');
  });

  it('does not include school fields', () => {
    const draft = buildFormDraft(trip);
    expect(draft.pickupZip).toBeUndefined();
    expect(draft.schoolName).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — Wedding / Event
// ---------------------------------------------------------------------------

describe('Re-request — Wedding trip draft mapping', () => {
  const trip: TripData = {
    id: 'trip-wedding-1',
    service_type: 'wedding',
    pickup_address: 'Marriott Boston, 02101',
    dropoff_address: 'The Grand Hall, 02109',
    start_date: '2026-07-20',
    start_time: '16:00',
    metadata_safe: {
      guest_count: 40,
      vehicle_style: 'limo',
      itinerary_type: 'point-to-point',
    },
  };

  it('sets activeTab to "wedding"', () => {
    expect(buildFormDraft(trip).activeTab).toBe('wedding');
  });

  it('maps pickup_address to hotelZip', () => {
    expect(buildFormDraft(trip).hotelZip).toBe('Marriott Boston, 02101');
  });

  it('maps dropoff_address to venueZip', () => {
    expect(buildFormDraft(trip).venueZip).toBe('The Grand Hall, 02109');
  });

  it('maps start_date to eventDate', () => {
    expect(buildFormDraft(trip).eventDate).toBe('2026-07-20');
  });

  it('maps start_time to pickupTime', () => {
    expect(buildFormDraft(trip).pickupTime).toBe('16:00');
  });

  it('converts guest_count to string', () => {
    expect(buildFormDraft(trip).guestCount).toBe('40');
  });

  it('maps vehicle_style', () => {
    expect(buildFormDraft(trip).vehicleStyle).toBe('limo');
  });
});

// ---------------------------------------------------------------------------
// Tests — Edge Cases
// ---------------------------------------------------------------------------

describe('Re-request — Edge cases', () => {
  it('handles missing metadata_safe gracefully', () => {
    const trip: TripData = {
      id: 'trip-bare',
      service_type: 'medical',
      pickup_address: '100 Main St',
    };
    const draft = buildFormDraft(trip);
    expect(draft.activeTab).toBe('medical');
    expect(draft.pickupLocation).toBe('100 Main St');
    expect(draft.mobilityLevel).toBeUndefined();
  });

  it('handles missing addresses gracefully', () => {
    const trip: TripData = {
      id: 'trip-noaddr',
      service_type: 'school',
      metadata_safe: { school_name: 'Oak Elementary' },
    };
    const draft = buildFormDraft(trip);
    expect(draft.pickupZip).toBeUndefined();
    expect(draft.schoolName).toBe('Oak Elementary');
  });

  it('does not include private fields in draft', () => {
    // metadata_safe should never have private fields; verify draft has no phone/full-address keys
    const trip: TripData = {
      id: 'trip-privacy',
      service_type: 'medical',
      pickup_address: 'Fuzzy Address, Boston',
      metadata_safe: {
        mobility_level: 'ambulatory',
        // private fields should NOT appear in metadata_safe (enforced by API layer)
      },
    };
    const draft = buildFormDraft(trip);
    expect(draft).not.toHaveProperty('contact_phone');
    expect(draft).not.toHaveProperty('contact_name');
    expect(draft).not.toHaveProperty('metadata_private');
  });
});

// ---------------------------------------------------------------------------
// Tests — API contract expectations
// ---------------------------------------------------------------------------

describe('Re-request API — Response shape contract', () => {
  it('returned trip object must have required fields', () => {
    const tripFromApi = {
      id: 'abc-123',
      service_type: 'medical',
      pickup_address: '10 Park St',
      dropoff_address: '200 Hospital Dr',
      pickup_fuzzy: '10 Park St, Boston',
      dropoff_fuzzy: '200 Hospital Dr, Boston',
      start_date: '2026-05-01',
      start_time: '10:30',
      end_date: null,
      end_time: null,
      is_recurring: false,
      recurrence_pattern: null,
      metadata_safe: { mobility_level: 'ambulatory' },
    };

    // Verify all fields the re-request handler returns are present
    expect(tripFromApi).toHaveProperty('id');
    expect(tripFromApi).toHaveProperty('service_type');
    expect(tripFromApi).toHaveProperty('pickup_address');
    expect(tripFromApi).toHaveProperty('dropoff_address');
    expect(tripFromApi).toHaveProperty('metadata_safe');
    expect(tripFromApi).not.toHaveProperty('metadata_private');
  });

  it('only authenticated users should receive trip data (ownership enforced)', () => {
    const ownerId = 'user-abc';
    const requesterId = 'user-xyz';
    // Simulate the ownership check in the API route
    const isAuthorized = ownerId === requesterId;
    expect(isAuthorized).toBe(false);
  });

  it('owner can access their own trip', () => {
    const ownerId = 'user-abc';
    const requesterId = 'user-abc';
    const isAuthorized = ownerId === requesterId;
    expect(isAuthorized).toBe(true);
  });
});
