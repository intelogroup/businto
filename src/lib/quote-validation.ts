import { z } from 'zod';

export const quoteSchema = z.object({
  request_id: z.string().uuid(),
  operator_id: z.string().uuid().nullable(),
  total_price: z.number().nonnegative(),
  base_fare: z.number().nonnegative().optional(),
  distance_charge: z.number().nonnegative().optional(),
  additional_fees: z.array(z.object({
    name: z.string(),
    amount: z.number()
  })).optional(),
  vehicle_type: z.string().min(1),
  vehicle_year: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
  vehicle_capacity: z.number().int().positive().optional(),
  vehicle_photo_url: z.string().url().optional().or(z.literal('')),
  wheelchair_accessible: z.boolean().optional(),
  note: z.string().max(1000).optional(),
});

export type QuoteInput = z.infer<typeof quoteSchema>;

export function validateQuote(data: unknown) {
  return quoteSchema.safeParse(data);
}
