import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail, emailTemplates } from '@/lib/email';
import { generateUserTripToken } from '@/lib/tokens';
import { generateTripViewLink } from '@/lib/email-helpers';

export async function POST(request: NextRequest) {
  try {
    // ── Auth guard ────────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ─────────────────────────────────────────────────────────────────────

    const { tripRequestId, quoteCount, emailType } = await request.json();

    if (!tripRequestId || !quoteCount || !emailType) {
      return NextResponse.json(
        { error: 'Missing required fields: tripRequestId, quoteCount, emailType' },
        { status: 400 }
      );
    }

    // Fetch user profile for email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.email) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Generate tracking-resistant claim link for the trip
    const claimLink = await generateTripViewLink(tripRequestId, user.id, profile.email);

    // Fetch the request + most recent quote for context
    const { data: tripRequest, error: requestError } = await supabase
      .from('transport_requests')
      .select(`
         id, service_type, pickup_fuzzy, dropoff_fuzzy, start_date,
         quotes (
           id, total_price, vehicle_type,
           operator:operators!quotes_operator_id_fkey (
           id,
           company_name,
           company_email,
           company_phone,
           profile:profiles!profile_id (
             full_name,
             avatar_url
           )
         )
         )
       `)
      .eq('id', tripRequestId)
      .eq('user_id', user.id) // Ownership check — users can only trigger notifications for their own requests
      .single();

    if (requestError || !tripRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Use the most recent quote for the email template
    // Note: Supabase returns joined relations as arrays when using shorthand select
    const quotes = Array.isArray(tripRequest.quotes) ? tripRequest.quotes : [];
    type QuoteRow = {
      id: string;
      total_price: number;
      vehicle_type: string;
      operator: Array<{ company_name: string }> | { company_name: string } | null;
    };
    const typedQuotes = quotes as unknown as QuoteRow[];
    const latestQuote = typedQuotes[typedQuotes.length - 1];

    // operator can be an array (Supabase join) or a single object depending on the FK
    const getOperatorName = (op: QuoteRow['operator']): string => {
      if (!op) return 'An operator';
      if (Array.isArray(op)) return op[0]?.company_name ?? 'An operator';
      return op.company_name ?? 'An operator';
    };

    if (latestQuote) {
      await sendEmail({
        to: profile.email,
        ...emailTemplates.quoteReceived({
          userName: profile.full_name || 'there',
          operatorName: getOperatorName(latestQuote.operator),
          price: latestQuote.total_price,
          vehicleType: latestQuote.vehicle_type,
          requestId: tripRequest.id,
          quoteId: latestQuote.id,
          claimLink,
          appBaseUrl: process.env.NEXT_PUBLIC_APP_URL,
        })
      });
    } else {
      // No quote data available — send a generic "quotes are in" email
      await sendEmail({
        to: profile.email,
        subject: `${quoteCount} operator${quoteCount > 1 ? 's' : ''} quoted your route`,
        html: `<p>Hi ${profile.full_name || 'there'},</p><p>You have ${quoteCount} quote(s) for your transport request. <a href="${claimLink}">View them in your dashboard →</a></p>`
      });
    }

    console.log(`[notify] ${emailType} notification sent for request ${tripRequestId}`);

    return NextResponse.json({
      success: true,
      message: 'Notification sent successfully',
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
