import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireUser } from '@/lib/supabase-server';
import { validateQuote } from '@/lib/quote-validation';
import { logEvent } from '@/lib/event-logger';
import { sendEmail, emailTemplates, getAppBaseUrl } from '@/lib/email';
import { generateTripViewLink } from '@/lib/email-helpers';

/**
 * POST /api/operator/quote
 *
 * Authenticated operator submits a quote on a transport request.
 * Unlike /api/quotes (token-based from email links), this route uses
 * session auth for operators using the dashboard UI.
 *
 * SECURITY: Requires authenticated operator. Scopes to their company.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve operator company ID
    const { data: opProfile } = await supabaseAdmin
      .from('operator_profiles')
      .select('operator_id')
      .eq('id', user.id)
      .maybeSingle();

    let operatorId = opProfile?.operator_id;

    if (!operatorId) {
      const { data: directOp } = await supabaseAdmin
        .from('operators')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!directOp) {
        return NextResponse.json(
          { error: 'Not an operator. Only registered operators can submit quotes.' },
          { status: 403 }
        );
      }
      operatorId = directOp.id;
    }

    const body = await request.json();
    const { request_id, total_price, vehicle_type, note, estimated_arrival } = body;

    // Validate with existing Zod schema
    const validation = validateQuote({
      request_id,
      operator_id: operatorId,
      total_price: total_price ?? 0,
      vehicle_type,
      note,
    });

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid quote data', details: validation.error.format() },
        { status: 400 }
      );
    }

    // MARKETPLACE INTEGRITY: Check request isn't already locked
    const { data: acceptedQuote } = await supabaseAdmin
      .from('quotes')
      .select('id')
      .eq('request_id', request_id)
      .eq('status', 'accepted')
      .maybeSingle();

    if (acceptedQuote) {
      return NextResponse.json(
        { error: 'This request has already been fulfilled.' },
        { status: 409 }
      );
    }

    // Check for duplicate quote
    const { data: existingQuote } = await supabaseAdmin
      .from('quotes')
      .select('id, status')
      .eq('request_id', request_id)
      .eq('operator_id', operatorId)
      .maybeSingle();

    if (existingQuote && existingQuote.status !== 'withdrawn') {
      return NextResponse.json(
        { error: 'You have already submitted a quote for this request.' },
        { status: 409 }
      );
    }

    // If withdrawn, delete old quote to allow resubmission
    if (existingQuote?.status === 'withdrawn') {
      await supabaseAdmin.from('quotes').delete().eq('id', existingQuote.id);
    }

    // Insert the quote
    const { data: quote, error: insertError } = await supabaseAdmin
      .from('quotes')
      .insert({
        request_id,
        operator_id: operatorId,
        submitted_by: user.id,
        total_price: total_price ?? 0,
        vehicle_type,
        note: note || null,
        status: 'pending',
      })
      .select(`
        *,
        operator:operators (id, company_name, company_email, rating)
      `)
      .single();

    if (insertError) {
      console.error('Quote insert error:', insertError);
      await logEvent({
        event_type: 'quote.submission.db_error',
        status: 'error',
        operator_id: operatorId,
        request_id,
        message: 'Failed to insert quote via dashboard',
        metadata: { error: insertError.message },
      });
      return NextResponse.json({ error: 'Failed to submit quote. Please try again.' }, { status: 500 });
    }

    await logEvent({
      event_type: 'quote.submitted',
      actor_type: 'operator',
      actor_id: user.id,
      operator_id: operatorId,
      request_id,
      quote_id: quote.id,
      metadata: { total_price: total_price ?? 0, vehicle_type, source: 'dashboard' },
    });

    // Update request status to 'quoted' if first quote
    await supabaseAdmin
      .from('transport_requests')
      .update({ status: 'quoted' })
      .eq('id', request_id)
      .eq('status', 'pending');

    // Send notification email to user (fire and forget)
    try {
      const appBaseUrl = getAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL || '');
      const { data: transportRequest } = await supabaseAdmin
        .from('transport_requests')
        .select('user_id, metadata_private, userProfile:profiles!user_id(email, full_name)')
        .eq('id', request_id)
        .single();

      if (transportRequest) {
        const joinedProfile = (transportRequest as any)?.userProfile;
        let userEmail = joinedProfile?.email || null;
        let userName = joinedProfile?.full_name || null;
        const privateMetadata = transportRequest?.metadata_private || {};
        if (!userEmail && (privateMetadata?.parent_email || privateMetadata?.contact_email)) {
          userEmail = privateMetadata.parent_email || privateMetadata.contact_email;
          userName = privateMetadata.parent_name || privateMetadata.contact_name || 'Parent';
        }

        if (userEmail) {
          const operatorName = quote.operator?.company_name || 'An operator';
          const claimLink = await generateTripViewLink(
            request_id,
            transportRequest.user_id || null,
            userEmail,
            quote.operator_id
          );

          await sendEmail({
            to: userEmail,
            ...emailTemplates.quoteReceived({
              userName: userName || 'User',
              operatorName,
              price: total_price ?? 0,
              vehicleType: vehicle_type,
              requestId: request_id,
              quoteId: quote.id,
              claimLink,
              appBaseUrl,
            }),
          });

          if (transportRequest.user_id) {
            await supabaseAdmin.from('notifications').insert({
              user_id: transportRequest.user_id,
              type: 'quote_received',
              title: 'New Quote Received!',
              message:
                total_price === 0
                  ? `${operatorName} sent you an estimate. They wish to discuss details.`
                  : `${operatorName} sent you a quote for $${total_price}`,
              data: { request_id, quote_id: quote.id, link: `/trips/${request_id}` },
            });
          }
        }
      }
    } catch (emailErr) {
      console.error('Failed to send quote notification email:', emailErr);
    }

    return NextResponse.json({
      success: true,
      quote,
      message: 'Quote submitted successfully',
    });
  } catch (error) {
    console.error('Error in operator quote submission:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
