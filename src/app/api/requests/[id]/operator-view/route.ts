import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyOperatorViewToken, checkRateLimit, getClientIP } from '@/lib/tokens';
import { logEvent } from '@/lib/event-logger';
import type { OperatorRequestView } from '@/types/requests';

// Server-side Supabase client with service role for full data access
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  }
);

/**
 * Operator View API - Returns sanitized transport request data
 * 
 * This endpoint enforces the architectural boundary between operator-visible
 * data and private parent information. Operators can only access:
 * - Fuzzy locations (not exact addresses)
 * - Safe metadata (requirements, preferences)
 * - Service details (dates, times, type)
 * 
 * PII is never exposed through this endpoint.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    console.log(`[Operator View] Processing request for ID: ${id}`);

    if (!id) {
      return NextResponse.json(
        { error: 'Request ID is required' },
        { status: 400 }
      );
    }

    // SECURITY: Require signed token for access
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      await logEvent({
        event_type: 'operator_view.auth_failed',
        status: 'error',
        request_id: id,
        message: 'Missing access token in request'
      });
      return NextResponse.json(
        { error: 'Access token required' },
        { status: 401 }
      );
    }

    // Verify token signature and expiry
    const payload = await verifyOperatorViewToken(token);
    if (!payload) {
      await logEvent({
        event_type: 'operator_view.auth_failed',
        status: 'error',
        request_id: id,
        message: 'Invalid or expired token signature'
      });
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Verify token matches requested resource
    if (payload.requestId !== id) {
      await logEvent({
        event_type: 'operator_view.auth_failed',
        status: 'error',
        request_id: id,
        message: 'Token resource mismatch',
        metadata: { token_request_id: payload.requestId }
      });
      return NextResponse.json(
        { error: 'Token does not match requested resource' },
        { status: 403 }
      );
    }

    // RATE LIMITING: Prevent abuse and scraping
    const clientIP = getClientIP(request);
    const rateLimitKey = `${clientIP}:${id}`;

    if (!checkRateLimit(rateLimitKey, 10)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 10 requests per hour per request.' },
        { status: 429 }
      );
    }

    // Log access to audit table (async, don't block response)
    const userAgent = request.headers.get('user-agent') || 'unknown';
    supabaseAdmin
      .from('operator_access_log')
      .insert({
        request_id: id,
        ip_address: clientIP,
        user_agent: userAgent,
        operator_id: payload.operatorId || null,
        token_purpose: payload.purpose,
        accessed_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) {
          console.error('Failed to log access for request:', id, error);
        }
      });

    // Fetch only safe fields from the database
    // metadata_private, pickup_address, dropoff_address, user_id are intentionally excluded
    console.log(`[Operator View] Fetching request ${id}...`);
    const { data, error } = await supabaseAdmin
      .from('transport_requests')
      .select(`
        id,
        service_type,
        pickup_fuzzy,
        dropoff_fuzzy,
        start_date,
        start_time,
        end_date,
        is_recurring,
        recurrence_pattern,
        metadata_safe,
        status,
        created_at
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('[Operator View] Request not found:', id, error);
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    if (process.env.NODE_ENV !== 'production') console.log('[Operator View] Request found:', id);

    // Return the sanitized DTO
    // This is the ONLY data operators should ever see
    const response: OperatorRequestView = {
      id: data.id,
      service_type: data.service_type,
      pickup_fuzzy: data.pickup_fuzzy,
      dropoff_fuzzy: data.dropoff_fuzzy,
      start_date: data.start_date,
      start_time: data.start_time,
      end_date: data.end_date,
      is_recurring: data.is_recurring,
      recurrence_pattern: data.recurrence_pattern,
      metadata_safe: data.metadata_safe,
      status: data.status,
      created_at: data.created_at,
      operator_id: payload.operatorId || null,
    };

    return NextResponse.json(response);

  } catch (err) {
    console.error('Error in operator view API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
