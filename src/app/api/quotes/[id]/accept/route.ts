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

    // Update quote status to accepted
    const { error: updateError } = await supabaseAdmin
      .from('quotes')
      .update({ 
        status: 'accepted',
        updated_at: new Date().toISOString()
      })
      .eq('id', quoteId);

    if (updateError) {
      console.error('Error updating quote status:', updateError);
      return NextResponse.redirect(
        new URL('/dashboard?error=Failed to accept quote', request.url)
      );
    }

    // Get parent contact info from metadata_private
    const request_data = quote.transport_requests;
    const metadata_private = request_data.metadata_private || {};
    const parentEmail = metadata_private.parent_email || request_data.profiles?.email;
    const parentPhone = metadata_private.parent_phone || request_data.profiles?.phone;
    const parentName = metadata_private.parent_name || request_data.profiles?.full_name || 'Customer';

    // Send email to operator with parent contact information
    if (quote.operators?.email) {
      try {
        const emailData = emailTemplates.quoteAccepted({
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
          passengers: request_data.passenger_count,
          vehicleType: quote.vehicle_type
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
