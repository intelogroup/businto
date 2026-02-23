-- Add 'withdrawn' status to quotes table
-- This allows operators to retract quotes they submitted accidentally

-- Drop the existing constraint
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;

-- Add new constraint with 'withdrawn' status
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check 
  CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'withdrawn'));

-- Add comment for clarity
COMMENT ON COLUMN quotes.status IS 'Quote status: pending (awaiting customer), accepted (customer chose this), declined (customer rejected), expired (time limit passed), withdrawn (operator retracted)';
