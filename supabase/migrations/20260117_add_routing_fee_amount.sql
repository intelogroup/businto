-- Add routing_fee_amount column to bookings table
-- This separates the $1.99 routing fee we charge from the operator quote amount
ALTER TABLE bookings 
ADD COLUMN routing_fee_amount DECIMAL(10,2) DEFAULT 1.99 NOT NULL;

-- Add comment explaining the business model
COMMENT ON COLUMN bookings.routing_fee_amount IS 'Platform routing fee charged to requester ($1.99). Operator quote amount is stored in amount column but paid separately outside platform.';
COMMENT ON COLUMN bookings.amount IS 'Operator quote total (trip cost). Stored for reference but operator is paid directly, not through platform.';

-- Backfill existing bookings with $1.99 routing fee
UPDATE bookings 
SET routing_fee_amount = 1.99 
WHERE routing_fee_amount IS NULL;
