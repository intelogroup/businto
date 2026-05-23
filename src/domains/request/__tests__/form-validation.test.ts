import { describe, it, expect } from "vitest";
import {
  SchoolRequestSchema,
  MedicalRequestSchema,
  EventRequestSchema,
} from "@/lib/schemas";

describe("Domain Request Validation Schemas", () => {
  describe("SchoolRequestSchema", () => {
    it("should validate a correct school request", () => {
      const validRequest = {
        service_type: "school",
        pickup_address: "123 Main St, Boston, MA",
        dropoff_address: "Malden Catholic, Malden, MA",
        pickup_fuzzy: "123 Main St, Boston, MA",
        dropoff_fuzzy: "Malden Catholic, Malden, MA",
        start_date: "2026-09-01",
        is_recurring: true,
        recurrence_pattern: "weekdays",
        metadata: {
          school_name: "Malden Catholic",
          grade_level: "high",
          student_count: 1,
          student_age: 14,
          schedule_type: "round-trip",
          school_recurring: "recurring",
          selected_days: "M,T,W,Th,F",
          am_pickup_time: "07:30",
          pm_pickup_time: "14:30",
          school_start_time: "08:00",
          school_dismissal_time: "14:30",
        },
      };

      const result = SchoolRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("should fail validation if am_pickup_time is missing for a round-trip schedule", () => {
      const invalidRequest = {
        service_type: "school",
        pickup_address: "123 Main St, Boston, MA",
        dropoff_address: "Malden Catholic, Malden, MA",
        start_date: "2026-09-01",
        metadata: {
          school_name: "Malden Catholic",
          grade_level: "high",
          student_count: 1,
          schedule_type: "round-trip",
          school_recurring: "one-time",
        },
      };

      const result = SchoolRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe("MedicalRequestSchema", () => {
    it("should validate a correct medical request", () => {
      const validRequest = {
        service_type: "medical",
        pickup_address: "123 Main St, Boston, MA",
        dropoff_address: "Boston Medical Center, Boston, MA",
        start_date: "2026-06-01",
        start_time: "09:00",
        metadata: {
          mobility_level: "ambulatory",
          service_level: "curb-to-curb",
          trip_type: "one-way",
          appointment_time: "09:30",
        },
      };

      const result = MedicalRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("should fail validation if appointment_time is missing", () => {
      const invalidRequest = {
        service_type: "medical",
        pickup_address: "123 Main St, Boston, MA",
        dropoff_address: "Boston Medical Center, Boston, MA",
        start_date: "2026-06-01",
        start_time: "09:00",
        metadata: {
          mobility_level: "ambulatory",
          service_level: "curb-to-curb",
          trip_type: "one-way",
        },
      };

      const result = MedicalRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe("EventRequestSchema", () => {
    it("should validate a correct event/wedding request", () => {
      const validRequest = {
        service_type: "wedding",
        pickup_address: "Boston Marriott, Boston, MA",
        dropoff_address: "The State Room, Boston, MA",
        start_date: "2026-10-10",
        start_time: "16:00",
        metadata: {
          event_category: "wedding",
          guest_count: 150,
          vehicle_style: "coach",
          itinerary_type: "hotel-to-venue",
          shuttle_mode: "single-trip",
          pickup_time: "16:00",
          contact_name: "John Doe",
          contact_phone: "555-000-0000",
          contact_email: "john@example.com",
        },
      };

      const result = EventRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });
});
