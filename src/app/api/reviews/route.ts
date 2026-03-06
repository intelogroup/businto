import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase, requireUser } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { booking_id, operator_id, rating, comment } = await request.json();

    if (!booking_id || !operator_id || !rating) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    // SECURITY: Use session user id — never trust user_id from request body
    const user_id = user.id;

    // SECURITY: Verify this booking belongs to the authenticated user
    const { data: booking } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', booking_id)
      .eq('user_id', user_id)
      .single();

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found or access denied' }, { status: 403 });
    }

    // Check if review already exists
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('booking_id', booking_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Review already exists for this booking' },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        booking_id,
        user_id,
        operator_id,
        rating,
        comment
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Notify operator
    await supabase
      .from('notifications')
      .insert({
        user_id: operator_id,
        type: 'review_received',
        title: 'New Review',
        message: `You received a ${rating}-star review!`,
        data: { review_id: data.id, booking_id }
      });

    return NextResponse.json({
      success: true,
      review: data
    });
  } catch (error) {
    console.error('Error creating review:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operatorId = searchParams.get('operator_id');
    const userId = searchParams.get('user_id');

    // SECURITY: Require at least one filter — prevent unbounded enumeration of all reviews.
    // operator_id is allowed unauthenticated (public operator profiles).
    // user_id filter requires authentication (user's own review history).
    if (!operatorId && !userId) {
      return NextResponse.json(
        { error: 'operator_id or user_id filter is required' },
        { status: 400 }
      );
    }

    if (userId) {
      // Filtering by user_id requires auth — users can only fetch their own reviews
      const user = await requireUser();
      if (!user || user.id !== userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Public operator reviews: only expose reviewer name + avatar (no booking confirmation codes)
    const selectClause = operatorId && !userId
      ? `
          id, rating, comment, operator_response, operator_response_at, created_at,
          user:profiles!reviews_user_id_fkey (
            id,
            full_name,
            avatar_url
          )
        `
      : `
          *,
          user:profiles!reviews_user_id_fkey (
            id,
            full_name,
            avatar_url
          ),
          booking:bookings (
            id,
            confirmation_code,
            request:transport_requests (
              service_type
            )
          )
        `;

    let query = supabase
      .from('reviews')
      .select(selectClause)
      .order('created_at', { ascending: false });

    if (operatorId) {
      query = query.eq('operator_id', operatorId);
    }
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate average rating if filtering by operator
    let averageRating = 0;
    if (data && data.length > 0) {
      averageRating = (data as any[]).reduce((sum, r) => sum + r.rating, 0) / data.length;
    }

    return NextResponse.json({
      reviews: data,
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews: data?.length || 0
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Operator response to review
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { review_id, operator_response } = await request.json();

    if (!review_id || !operator_response) {
      return NextResponse.json(
        { error: 'Missing review_id or operator_response' },
        { status: 400 }
      );
    }

    // SECURITY: Verify the authenticated user is the operator on this review
    const { data: review } = await supabase
      .from('reviews')
      .select('operator_id')
      .eq('id', review_id)
      .single();

    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    // operator_id in reviews references operators table; look up via operator_profiles
    const { data: opProfile } = await supabase
      .from('operator_profiles')
      .select('operator_id')
      .eq('id', user.id)
      .maybeSingle();

    const userOperatorId = opProfile?.operator_id ?? null;

    if (!userOperatorId || userOperatorId !== review.operator_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('reviews')
      .update({
        operator_response,
        operator_response_at: new Date().toISOString()
      })
      .eq('id', review_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, review: data });
  } catch (error) {
    console.error('Error updating review:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
