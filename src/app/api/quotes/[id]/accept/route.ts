import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendEmail, emailTemplates } from '@/lib/email';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: quoteId } = await params;

    // Fetch the quote with related data
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('quotes')
      .select(`
        *,
        transport_requests (
          *,
          profiles!transport_requests_user_id_fkey (
            full_name,
            email,
            phone
          )
        ),
        operators (
          company_name,
          email
        )
      `)
      .eq('id', quoteId)
      .single();

    if (quoteError || !quote) {
      return NextResponse.redirect(
        new URL('/dashboard?error=Quote not found', request.url)
      );
    }

    // 1. Enforce single acceptance: check if ANY quote is already accepted for this request
    const { data: existingAccepted } = await supabaseAdmin
      .from('quotes')
      .select('id')
      .eq('request_id', quote.request_id)
      .eq('status', 'accepted')
      .maybeSingle();

    if (existingAccepted) {
      return NextResponse.redirect(
        new URL('/dashboard?error=You have already accepted a quote for this request. Acceptance is final.', request.url)
      );
    }

    const request_data = quote.transport_requests;

    // 2. Defense in depth: check the request status as well
    if (request_data.status === 'booked' || request_data.status === 'quote_accepted') {
      return NextResponse.redirect(
        new URL('/dashboard?error=This request has already been booked. Acceptance is final.', request.url)
      );
    }

    // Update quote status to accepted
    const { error: updateError } = await supabaseAdmin
      .from('quotes')
      .update({
        status: 'accepted',
        updated_at: new Date().toISOString()
      })
      .eq('id', quoteId);

    if (!updateError) {
      // Clean up other quotes (decline them)
      await supabaseAdmin
        .from('quotes')
        .update({ status: 'declined' })
        .eq('request_id', quote.request_id)
        .neq('id', quoteId);

      // Update transport request status
      await supabaseAdmin
        .from('transport_requests')
        .update({ status: 'quote_accepted' })
        .eq('id', quote.request_id);
    }

    if (updateError) {
      console.error('Error updating quote status:', updateError);
      return NextResponse.redirect(
        new URL('/dashboard?error=Failed to accept quote', request.url)
      );
    }

    // Get parent contact info from metadata_private
    const metadata_private = request_data.metadata_private || {};
    const parentEmail = metadata_private.parent_email || request_data.profiles?.email;
    const parentPhone = metadata_private.parent_phone || request_data.profiles?.phone;
    const parentName = metadata_private.parent_name || request_data.profiles?.full_name || 'Customer';

    // Send email to operator with parent contact information
    if (quote.operators?.email) {
      try {
        const emailData = emailTemplates.operatorOrderDetails({
          operatorName: quote.operators.company_name,
          parentName: parentName,
          parentEmail: parentEmail || 'Not provided',
          parentPhone: parentPhone || 'Not provided',
          quoteAmount: quote.total_price,
          pickup: request_data.pickup_address,
          dropoff: request_data.dropoff_address,
          date: new Date(request_data.start_date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          vehicleType: quote.vehicle_type,
          confirmationCode: 'N/A', // Legacy route doesn't create booking yet
          bookingId: 'N/A'
        });

        await sendEmail({
          to: quote.operators.email,
          ...emailData
        });

        console.log('✅ Quote acceptance email sent to operator:', quote.operators.email);
      } catch (emailError) {
        console.error('Error sending acceptance email to operator:', emailError);
        // Don't fail the request if email fails
      }
    }

    // Redirect to dashboard with success message
    return NextResponse.redirect(
      new URL('/dashboard?success=Quote accepted successfully! The operator will contact you soon.', request.url)
    );
  } catch (error) {
    console.error('Error accepting quote:', error);
    return NextResponse.redirect(
      new URL('/dashboard?error=An error occurred', request.url)
    );
  }
}
