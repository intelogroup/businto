-- Atomic Quote Acceptance Function
-- Fixes race condition (C1): Uses SELECT FOR UPDATE to lock the request row
-- Fixes non-atomic quote locking (H1): All mutations in a single transaction
-- Fixes silent booking failure (C2): Booking creation is part of the transaction

CREATE OR REPLACE FUNCTION public.accept_quote_atomic(
  p_quote_id UUID,
  p_request_id UUID,
  p_user_id UUID,
  p_is_manual_mode BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_quote RECORD;
  v_booking_id UUID;
  v_confirmation_code TEXT;
  v_declined_operator_ids UUID[];
BEGIN
  -- 1. Lock the transport request row (prevents concurrent acceptance)
  SELECT id, status, user_id
  INTO v_request
  FROM transport_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found', 'code', 404);
  END IF;

  -- 2. Verify ownership
  IF v_request.user_id IS NOT NULL AND v_request.user_id != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden', 'code', 403);
  END IF;

  -- 3. Check if already booked (atomic — row is locked)
  IF v_request.status = 'booked' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Request already fulfilled',
      'code', 409,
      'locked', true
    );
  END IF;

  -- 4. Lock and verify the quote
  SELECT id, status, operator_id, total_price, vehicle_type, expires_at
  INTO v_quote
  FROM quotes
  WHERE id = p_quote_id AND request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quote not found', 'code', 404);
  END IF;

  -- 5. Check quote expiry
  IF v_quote.expires_at IS NOT NULL AND v_quote.expires_at < NOW() THEN
    UPDATE quotes SET status = 'expired' WHERE id = p_quote_id AND status != 'expired';
    RETURN jsonb_build_object('success', false, 'error', 'Quote has expired', 'code', 410);
  END IF;

  -- 6. Check quote is still pending
  IF v_quote.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Quote is %s, not pending', v_quote.status),
      'code', 409
    );
  END IF;

  -- 7. Accept the quote
  UPDATE quotes SET status = 'accepted' WHERE id = p_quote_id;

  -- 8. Decline all other quotes and collect their operator IDs
  WITH declined AS (
    UPDATE quotes
    SET status = 'declined'
    WHERE request_id = p_request_id
      AND id != p_quote_id
      AND status = 'pending'
    RETURNING operator_id
  )
  SELECT array_agg(DISTINCT operator_id) INTO v_declined_operator_ids FROM declined;

  -- 9. Update request status to booked
  UPDATE transport_requests
  SET status = 'booked', updated_at = NOW()
  WHERE id = p_request_id;

  -- 10. Create booking (part of the same transaction — rolls back if it fails)
  v_confirmation_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8));

  INSERT INTO bookings (
    request_id, quote_id, user_id, operator_id,
    amount, status, payment_status, confirmation_code,
    requires_manual_exchange
  ) VALUES (
    p_request_id, p_quote_id, p_user_id, v_quote.operator_id,
    v_quote.total_price, 'confirmed', 'pending', v_confirmation_code,
    p_is_manual_mode
  )
  RETURNING id INTO v_booking_id;

  -- 11. Return success with all IDs needed by the caller
  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'confirmation_code', v_confirmation_code,
    'operator_id', v_quote.operator_id,
    'total_price', v_quote.total_price,
    'vehicle_type', v_quote.vehicle_type,
    'declined_operator_ids', COALESCE(v_declined_operator_ids, ARRAY[]::UUID[])
  );
END;
$$;

-- Grant execute to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.accept_quote_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_quote_atomic TO service_role;
