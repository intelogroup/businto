import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { booking_id, user_id, operator_id, rating, comment } = await request.json();

    if (!booking_id || !user_id || !operator_id || !rating) {
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

    let query = supabase
      .from('reviews')
      .select(`
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
      `)
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
      averageRating = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
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
    const { review_id, operator_response } = await request.json();

    if (!review_id || !operator_response) {
      return NextResponse.json(
        { error: 'Missing review_id or operator_response' },
        { status: 400 }
      );
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
