import { describe, it, expect } from 'vitest';
import { validateTransportRequest } from '@/lib/validation';

describe('validateTransportRequest', () => {
    it('should validate a complete school request successfully', () => {
        const data = {
            service_type: 'school',
            pickup_address: '123 Main St',
            start_date: '2023-09-01',
            metadata: {
                school_name: 'Lincoln Elementary',
                grade_level: 'elem',
                student_count: 2,
                schedule_type: 'round-trip',
                am_pickup_time: '07:30',
                pm_pickup_time: '14:30',
                school_recurring: 'recurring',
                selected_days: 'Monday,Tuesday'
            }
        };
        const result = validateTransportRequest(data);
        if (!result.success) {
            console.log('Validation Errors for school:', result.errors);
        }
        expect(result.success).toBe(true);
    });

    it('should fail if missing am_pickup_time for round-trip school request', () => {
        const data = {
            service_type: 'school',
            start_date: '2023-09-01',
            metadata: {
                student_count: 1,
                schedule_type: 'round-trip',
                pm_pickup_time: '14:30',
                school_recurring: 'one-time'
            }
        };
        const result = validateTransportRequest(data);
        expect(result.success).toBe(false);

        // Zod puts refine errors on the path we specified
        if (!result.success && result.errors) {
            console.log('Errors:', result.errors);
            expect(result.errors['metadata.am_pickup_time'] || result.errors.am_pickup_time).toBeDefined();
        }
    });

    it('should validate medical request correctly', () => {
        const data = {
            service_type: 'medical',
            start_time: '10:00',
            start_date: '2023-09-01',
            pickup_address: '456 Healthcare Blvd',
            metadata: {
                trip_type: 'one-way',
                mobility_level: 'ambulatory',
                service_level: 'door-to-door',
                appointment_time: '10:30'
            }
        };
        const result = validateTransportRequest(data);
        if (!result.success) {
            console.log('Validation Errors for medical:', result.errors);
        }
        expect(result.success).toBe(true);
    });

    it('should fail medical request if round-trip with fixed time is missing return_time', () => {
        const data = {
            service_type: 'medical',
            start_time: '10:00',
            start_date: '2023-09-01',
            metadata: {
                trip_type: 'round-trip',
                return_status: 'fixed',
                mobility_level: 'ambulatory',
                service_level: 'door-to-door',
                appointment_time: '10:30'
            }
        };
        const result = validateTransportRequest(data);
        expect(result.success).toBe(false);
        if (!result.success && result.errors) {
            console.log('Errors:', result.errors);
            expect(result.errors['metadata.return_time'] || result.errors.return_time).toBeDefined();
        }
    });
});
