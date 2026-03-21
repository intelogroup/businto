import { describe, it, expect } from 'vitest';

/**
 * Booking Timeline Component logic tests
 * Tests the step resolution logic used by the BookingTimeline component
 */

// Replicate the step resolution logic from the component
function resolveStepStatus(
  stepIndex: number,
  currentStepIndex: number
): 'completed' | 'current' | 'upcoming' {
  if (stepIndex < currentStepIndex) return 'completed';
  if (stepIndex === currentStepIndex) return 'current';
  return 'upcoming';
}

function getCurrentStepIndex(requestStatus: string): number {
  switch (requestStatus) {
    case 'pending': return 0;
    case 'quoted': return 1;
    case 'booked':
    case 'quote_accepted': return 2;
    case 'in-progress':
    case 'in_progress': return 3;
    case 'completed': return 4;
    case 'cancelled': return -1;
    default: return 0;
  }
}

describe('BookingTimeline Logic', () => {
  describe('getCurrentStepIndex', () => {
    it('should return 0 for pending status', () => {
      expect(getCurrentStepIndex('pending')).toBe(0);
    });

    it('should return 1 for quoted status', () => {
      expect(getCurrentStepIndex('quoted')).toBe(1);
    });

    it('should return 2 for booked status', () => {
      expect(getCurrentStepIndex('booked')).toBe(2);
    });

    it('should return 2 for quote_accepted status (alias)', () => {
      expect(getCurrentStepIndex('quote_accepted')).toBe(2);
    });

    it('should return 3 for in-progress status', () => {
      expect(getCurrentStepIndex('in-progress')).toBe(3);
    });

    it('should return 3 for in_progress status (underscore variant)', () => {
      expect(getCurrentStepIndex('in_progress')).toBe(3);
    });

    it('should return 4 for completed status', () => {
      expect(getCurrentStepIndex('completed')).toBe(4);
    });

    it('should return -1 for cancelled status', () => {
      expect(getCurrentStepIndex('cancelled')).toBe(-1);
    });

    it('should default to 0 for unknown status', () => {
      expect(getCurrentStepIndex('unknown')).toBe(0);
    });
  });

  describe('resolveStepStatus', () => {
    it('should mark steps before current as completed', () => {
      // Current step is 2 (booked), step 0 should be completed
      expect(resolveStepStatus(0, 2)).toBe('completed');
      expect(resolveStepStatus(1, 2)).toBe('completed');
    });

    it('should mark current step as current', () => {
      expect(resolveStepStatus(2, 2)).toBe('current');
    });

    it('should mark steps after current as upcoming', () => {
      expect(resolveStepStatus(3, 2)).toBe('upcoming');
      expect(resolveStepStatus(4, 2)).toBe('upcoming');
    });
  });

  describe('Timeline Flow Integration', () => {
    it('should show correct flow for a new pending request', () => {
      const stepIndex = getCurrentStepIndex('pending');
      expect(stepIndex).toBe(0);
      expect(resolveStepStatus(0, stepIndex)).toBe('current');
      expect(resolveStepStatus(1, stepIndex)).toBe('upcoming');
      expect(resolveStepStatus(2, stepIndex)).toBe('upcoming');
    });

    it('should show correct flow for a request with quotes', () => {
      const stepIndex = getCurrentStepIndex('quoted');
      expect(resolveStepStatus(0, stepIndex)).toBe('completed');
      expect(resolveStepStatus(1, stepIndex)).toBe('current');
      expect(resolveStepStatus(2, stepIndex)).toBe('upcoming');
    });

    it('should show correct flow for a booked trip', () => {
      const stepIndex = getCurrentStepIndex('booked');
      expect(resolveStepStatus(0, stepIndex)).toBe('completed');
      expect(resolveStepStatus(1, stepIndex)).toBe('completed');
      expect(resolveStepStatus(2, stepIndex)).toBe('current');
      expect(resolveStepStatus(3, stepIndex)).toBe('upcoming');
    });

    it('should show correct flow for a completed trip', () => {
      const stepIndex = getCurrentStepIndex('completed');
      expect(resolveStepStatus(0, stepIndex)).toBe('completed');
      expect(resolveStepStatus(1, stepIndex)).toBe('completed');
      expect(resolveStepStatus(2, stepIndex)).toBe('completed');
      expect(resolveStepStatus(3, stepIndex)).toBe('completed');
      expect(resolveStepStatus(4, stepIndex)).toBe('current');
    });

    it('cancelled trips get special handling (step index -1)', () => {
      const stepIndex = getCurrentStepIndex('cancelled');
      expect(stepIndex).toBe(-1);
      // All steps are "after" -1 so all upcoming
      expect(resolveStepStatus(0, stepIndex)).toBe('upcoming');
    });
  });
});
