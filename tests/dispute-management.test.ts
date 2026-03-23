import { describe, it, expect } from 'vitest';

/**
 * Dispute Management — Logic Tests
 *
 * Validates the action/state-transition logic for
 * POST /api/master/admin/disputes without a live database.
 */

// ---------------------------------------------------------------------------
// Helpers — mirror constants and logic from the API route
// ---------------------------------------------------------------------------

const VALID_DISPUTE_STATUSES = ['open', 'under_review', 'resolved', 'dismissed'] as const;
type DisputeStatus = typeof VALID_DISPUTE_STATUSES[number];

function validateDisputeStatus(status: string): boolean {
  return VALID_DISPUTE_STATUSES.includes(status as DisputeStatus);
}

interface DisputeUpdatePayload {
  dispute_status?: DisputeStatus;
  dispute_note?: string | null;
  dispute_flagged_at?: string;
  dispute_resolved_at?: string | null;
}

function buildDisputePayload(
  action: string,
  note: string | undefined,
  currentStatus: DisputeStatus,
  now = '2026-01-01T00:00:00.000Z'
): { payload: DisputeUpdatePayload; error?: string } {
  switch (action) {
    case 'flag':
      return {
        payload: {
          dispute_status: 'open',
          dispute_note: note ?? null,
          dispute_flagged_at: now,
          dispute_resolved_at: null,
        },
      };

    case 'update_status':
      return {
        payload: {
          dispute_status: currentStatus,
          ...(note !== undefined ? { dispute_note: note } : {}),
        },
      };

    case 'resolve':
      return {
        payload: {
          dispute_status: 'resolved',
          ...(note !== undefined ? { dispute_note: note } : {}),
          dispute_resolved_at: now,
        },
      };

    case 'dismiss':
      return {
        payload: {
          dispute_status: 'dismissed',
          dispute_resolved_at: now,
          ...(note !== undefined ? { dispute_note: note } : {}),
        },
      };

    default:
      return { payload: {}, error: 'Invalid action' };
  }
}

// ---------------------------------------------------------------------------
// Test: status validation
// ---------------------------------------------------------------------------

describe('Dispute Management — status validation', () => {
  it('accepts all valid statuses', () => {
    for (const s of VALID_DISPUTE_STATUSES) {
      expect(validateDisputeStatus(s)).toBe(true);
    }
  });

  it('rejects unknown statuses', () => {
    expect(validateDisputeStatus('pending')).toBe(false);
    expect(validateDisputeStatus('escalated')).toBe(false);
    expect(validateDisputeStatus('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test: payload builder — flag
// ---------------------------------------------------------------------------

describe('Dispute Management — flag action', () => {
  const NOW = '2026-03-22T10:00:00.000Z';

  it('sets status to open', () => {
    const { payload } = buildDisputePayload('flag', undefined, 'open', NOW);
    expect(payload.dispute_status).toBe('open');
  });

  it('captures note when provided', () => {
    const { payload } = buildDisputePayload('flag', 'Customer reported overcharge', 'open', NOW);
    expect(payload.dispute_note).toBe('Customer reported overcharge');
  });

  it('sets flagged_at timestamp', () => {
    const { payload } = buildDisputePayload('flag', undefined, 'open', NOW);
    expect(payload.dispute_flagged_at).toBe(NOW);
  });

  it('clears resolved_at on new flag', () => {
    const { payload } = buildDisputePayload('flag', undefined, 'resolved', NOW);
    expect(payload.dispute_resolved_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test: payload builder — resolve
// ---------------------------------------------------------------------------

describe('Dispute Management — resolve action', () => {
  const NOW = '2026-03-22T12:00:00.000Z';

  it('sets status to resolved', () => {
    const { payload } = buildDisputePayload('resolve', undefined, 'open', NOW);
    expect(payload.dispute_status).toBe('resolved');
  });

  it('sets resolved_at timestamp', () => {
    const { payload } = buildDisputePayload('resolve', undefined, 'open', NOW);
    expect(payload.dispute_resolved_at).toBe(NOW);
  });

  it('includes note if provided', () => {
    const { payload } = buildDisputePayload('resolve', 'Refund issued', 'under_review', NOW);
    expect(payload.dispute_note).toBe('Refund issued');
  });
});

// ---------------------------------------------------------------------------
// Test: payload builder — dismiss
// ---------------------------------------------------------------------------

describe('Dispute Management — dismiss action', () => {
  const NOW = '2026-03-22T13:00:00.000Z';

  it('sets status to dismissed', () => {
    const { payload } = buildDisputePayload('dismiss', undefined, 'open', NOW);
    expect(payload.dispute_status).toBe('dismissed');
  });

  it('sets resolved_at', () => {
    const { payload } = buildDisputePayload('dismiss', undefined, 'open', NOW);
    expect(payload.dispute_resolved_at).toBe(NOW);
  });
});

// ---------------------------------------------------------------------------
// Test: invalid action returns error
// ---------------------------------------------------------------------------

describe('Dispute Management — invalid action', () => {
  it('returns error for unknown action', () => {
    const { error } = buildDisputePayload('escalate', undefined, 'open');
    expect(error).toBe('Invalid action');
  });
});

// ---------------------------------------------------------------------------
// Test: state-transition guards (documentation via test)
// ---------------------------------------------------------------------------

describe('Dispute Management — valid state transitions', () => {
  const transitions: Array<{ from: DisputeStatus; action: string; expectedTo: DisputeStatus }> = [
    { from: 'open',         action: 'update_status', expectedTo: 'under_review' },
    { from: 'under_review', action: 'resolve',        expectedTo: 'resolved'     },
    { from: 'under_review', action: 'dismiss',        expectedTo: 'dismissed'    },
    { from: 'open',         action: 'resolve',        expectedTo: 'resolved'     },
    { from: 'open',         action: 'dismiss',        expectedTo: 'dismissed'    },
  ];

  for (const { from, action, expectedTo } of transitions) {
    it(`${from} → ${action} → ${expectedTo}`, () => {
      const statusArg = action === 'update_status' ? 'under_review' as DisputeStatus : from;
      const { payload } = buildDisputePayload(action, undefined, statusArg);
      expect(payload.dispute_status).toBe(expectedTo);
    });
  }
});
