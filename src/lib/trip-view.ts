import type { UserTripView } from '@/types/requests';

/**
 * Sanitized projection for the token-scoped trip views
 * (/api/trips/view-by-token and /api/trips/[id]).
 *
 * BUS-VIEW-TOKEN-DISCLOSURE-001: those endpoints used to fetch the
 * transport_requests row with select('*') and return it whole, handing
 * metadata_private (patient/guardian/contact PII) and the exact street
 * addresses to anyone holding the rider's forwardable 30-day magic link.
 *
 * The fix has two halves, both required:
 * - USER_TRIP_VIEW_SELECT narrows the database read itself (defense in
 *   depth, same pattern as the operator-view endpoints). It adds user_id,
 *   which the routes need server-side for their ownership check; user_id
 *   is never copied into the response.
 * - toUserTripView() builds the response from an explicit field list, so
 *   a column added to transport_requests later cannot leak by default.
 */
export const USER_TRIP_VIEW_SELECT = `
  id,
  user_id,
  service_type,
  pickup_fuzzy,
  dropoff_fuzzy,
  start_date,
  start_time,
  end_date,
  end_time,
  is_recurring,
  recurrence_pattern,
  metadata_safe,
  status,
  created_at
`;

/** Build the ONLY trip shape a view-token bearer may receive. */
export function toUserTripView(row: Record<string, any>): UserTripView {
  return {
    id: row.id,
    service_type: row.service_type,
    pickup_fuzzy: row.pickup_fuzzy,
    dropoff_fuzzy: row.dropoff_fuzzy,
    start_date: row.start_date,
    start_time: row.start_time,
    end_date: row.end_date,
    end_time: row.end_time,
    is_recurring: row.is_recurring,
    recurrence_pattern: row.recurrence_pattern,
    metadata_safe: row.metadata_safe,
    status: row.status,
    created_at: row.created_at,
  };
}
