-- Make operator_id nullable for anonymous MVP quotes
-- This allows operators to submit quotes without authentication

-- Drop the foreign key constraint temporarily
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_operator_id_fkey;

-- Make operator_id nullable
ALTER TABLE quotes ALTER COLUMN operator_id DROP NOT NULL;

-- Re-add the foreign key constraint (with NULL allowed)
ALTER TABLE quotes ADD CONSTRAINT quotes_operator_id_fkey 
  FOREIGN KEY (operator_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Add comment
COMMENT ON COLUMN quotes.operator_id IS 'Operator profile ID. NULL for anonymous MVP quotes (no authentication required).';
