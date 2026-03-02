import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifyUserTripToken } from '@/lib/tokens';
import { logEvent } from '@/lib/event-logger';

export async function GET(
    request: NextRequest
) {
    try {
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.json({ error: 'Auth required' }, { status: 401 });
        }

        // Verify token
        const decoded = await verifyUserTripToken(token);
        if (!decoded || !decoded.requestId) {
            return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 });
        }

        const id = decoded.requestId;
        console.log(`[Trip API (Token)] Fetching ID: ${id}`);

        // Fetch trip details using admin client to bypass user RLS
        const { data: trip, error: tripError } = await supabaseAdmin
            .from('transport_requests')
            .select('*')
            .eq('id', id)
            .single();

        if (tripError || !trip) {
            return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
        }

        // 2b. SECURITY: Verify ownership even with signed token (defense-in-depth)
        // For anonymous trips, trip.user_id will be null.
        if (trip.user_id && trip.user_id !== decoded.userId) {
            console.error(`[Security Alert] Token for user ${decoded.userId} attempted to access trip owned by ${trip.user_id}`);
            return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
        }

        // If the trip has a user_id but the token doesn't have a userId, reject
        if (trip.user_id && !decoded.userId) {
            console.error(`[Security Alert] Anonymous token attempted to access trip owned by ${trip.user_id}`);
            return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
        }

        // Fetch quotes
        const { data: quotes, error: quotesError } = await supabaseAdmin
            .from('quotes')
            .select(`
        *,
        operator:operators (
          id,
          company_name,
          company_email,
          company_phone,
          rating,
          total_reviews,
          cori_verified,
          insurance_verified,
          profile:operator_profiles!profile_id (
            full_name,
            avatar_url
          )
        )
      `)
            .eq('request_id', id)
            .order('total_price', { ascending: true });

        if (quotesError) {
            return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
        }

        return NextResponse.json({ trip, quotes });
    } catch (error) {
        console.error('Error in tokenized trip fetch:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
