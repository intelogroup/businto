import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifyUserTripToken } from '@/lib/tokens';

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id;
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.json({ error: 'Auth required' }, { status: 401 });
        }

        // Verify token
        const decoded = await verifyUserTripToken(token);
        if (!decoded || decoded.requestId !== id) {
            return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 });
        }

        // Fetch trip details using admin client to bypass user RLS
        const { data: trip, error: tripError } = await supabaseAdmin
            .from('transport_requests')
            .select('*')
            .eq('id', id)
            .single();

        if (tripError || !trip) {
            return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
        }

        // Fetch quotes
        const { data: quotes, error: quotesError } = await supabaseAdmin
            .from('quotes')
            .select(`
        *,
        operator:profiles!quotes_operator_id_fkey (
          company_name,
          full_name,
          avatar_url,
          phone,
          email
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
