import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireAdmin } from '@/lib/supabase-server';
import { sendEmail, emailTemplates, getAppBaseUrl } from '@/lib/email';
import { generateOperatorQuoteLink } from '@/lib/email-helpers';
import { extractRequirements } from '@/lib/operator-matching';
import { logEvent } from '@/lib/event-logger';

// GET — return current manual dispatch mode + operator list for the modal
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [{ data: setting }, { data: operators }] = await Promise.all([
    supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'manual_dispatch_mode')
      .maybeSingle(),
    supabaseAdmin
      .from('operators')
      .select('id, company_name, company_email, is_partner, is_verified')
      .order('is_partner', { ascending: false })
      .order('company_name'),
  ]);

  return NextResponse.json({
    manualDispatchMode: setting?.value === true,
    operators: operators || [],
  });
}

// POST — toggle mode or manually send operator email
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();

  // ── Toggle manual dispatch mode ──────────────────────────────────────────
  if (body.action === 'toggle') {
    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert({ key: 'manual_dispatch_mode', value: body.enabled, updated_at: new Date().toISOString() });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logEvent({
      event_type: body.enabled ? 'admin.manual_dispatch.enabled' : 'admin.manual_dispatch.disabled',
      actor_type: 'admin',
      metadata: { toggled_by: admin.id },
    });

    return NextResponse.json({ manualDispatchMode: body.enabled });
  }

  // ── Manually dispatch to a specific operator ─────────────────────────────
  if (body.action === 'send') {
    const { requestId, operatorId } = body;
    if (!requestId || !operatorId) {
      return NextResponse.json({ error: 'requestId and operatorId are required' }, { status: 400 });
    }

    // Fetch request
    const { data: request, error: reqError } = await supabaseAdmin
      .from('transport_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Fetch operator
    const { data: operator, error: opError } = await supabaseAdmin
      .from('operators')
      .select('id, company_name, company_email, is_partner')
      .eq('id', operatorId)
      .single();

    if (opError || !operator) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }

    const appBaseUrl = getAppBaseUrl();
    const claimLink = await generateOperatorQuoteLink(requestId, operatorId, operator.company_email);

    const serviceTypeMap: Record<string, string> = {
      school: 'School Transportation',
      medical: 'Medical Transportation',
      wedding: 'Event Shuttle',
      corporate: 'Corporate Travel',
    };

    const metadata = request.metadata_safe || {};
    const requirements = extractRequirements(request.service_type, metadata);

    await sendEmail({
      to: operator.company_email,
      ...emailTemplates.operatorNewRequest({
        operatorName: operator.company_name,
        serviceType: request.service_type,
        serviceTypeDisplay: serviceTypeMap[request.service_type] || request.service_type,
        pickupAddress: request.pickup_address,
        dropoffAddress: request.dropoff_address,
        pickupFuzzy: request.pickup_fuzzy || request.pickup_address.split(',')[0],
        dropoffFuzzy: request.dropoff_fuzzy || request.dropoff_address.split(',')[0],
        date: new Date(request.start_date).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
        }),
        time: request.start_time,
        scheduleType: metadata?.schedule_type,
        studentCount: metadata?.student_count,
        requirements,
        requestId,
        claimLink,
        appBaseUrl,
      }),
    });

    await logEvent({
      event_type: 'operator.request_email.sent',
      actor_type: 'admin',
      operator_id: operatorId,
      request_id: requestId,
      metadata: {
        operator_name: operator.company_name,
        to: operator.company_email,
        dispatched_by: admin.id,
        manual_dispatch: true,
      },
    });

    return NextResponse.json({ success: true, sentTo: operator.company_email });
  }

  // ── Create new operator + dispatch in one shot ───────────────────────────
  if (body.action === 'create_and_send') {
    const { requestId, operator: op } = body;
    if (!requestId || !op?.company_name || !op?.company_email || !op?.company_phone) {
      return NextResponse.json({ error: 'requestId, company_name, company_email, and company_phone are required' }, { status: 400 });
    }

    // Fetch request
    const { data: request, error: reqError } = await supabaseAdmin
      .from('transport_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    let operatorId: string;
    let isNewOperator = false;

    // Idempotency: check if operator with this email already exists
    const { data: existingOperator } = await supabaseAdmin
      .from('operators')
      .select('id, company_name, company_email, is_partner')
      .eq('company_email', op.company_email)
      .maybeSingle();

    if (existingOperator) {
      operatorId = existingOperator.id;
    } else {
      // Create Supabase auth user — email_confirm: true skips verification email (admin already vetted)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: op.company_email,
        email_confirm: true,
        password: crypto.randomUUID(),
        user_metadata: { role: 'operator', full_name: op.company_name },
      });

      if (authError || !authData?.user) {
        return NextResponse.json({ error: `Failed to create auth user: ${authError?.message}` }, { status: 500 });
      }

      const authUserId = authData.user.id;

      // Upsert profile
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: authUserId,
          email: op.company_email,
          full_name: op.company_name,
          role: 'operator',
        }, { onConflict: 'id' });

      if (profileError) {
        return NextResponse.json({ error: `Failed to create profile: ${profileError.message}` }, { status: 500 });
      }

      // Create operator record
      const { data: newOperator, error: opCreateError } = await supabaseAdmin
        .from('operators')
        .insert({
          profile_id: authUserId,
          company_name: op.company_name,
          company_email: op.company_email,
          company_phone: op.company_phone,
          vehicle_types: op.vehicle_types || [],
          is_partner: op.is_partner || false,
          is_verified: true,
          is_active: true,
          is_accepting_requests: true,
        })
        .select('id')
        .single();

      if (opCreateError || !newOperator) {
        return NextResponse.json({ error: `Failed to create operator: ${opCreateError?.message}` }, { status: 500 });
      }

      operatorId = newOperator.id;
      isNewOperator = true;
    }

    // Generate claim link and send operator email
    const appBaseUrl = getAppBaseUrl();
    const claimLink = await generateOperatorQuoteLink(requestId, operatorId, op.company_email);

    const serviceTypeMap: Record<string, string> = {
      school: 'School Transportation',
      medical: 'Medical Transportation',
      wedding: 'Event Shuttle',
      corporate: 'Corporate Travel',
    };
    const serviceTypeDisplay = serviceTypeMap[request.service_type] || request.service_type;

    const metadata = request.metadata_safe || {};
    const requirements = extractRequirements(request.service_type, metadata);

    await sendEmail({
      to: op.company_email,
      ...emailTemplates.operatorNewRequest({
        operatorName: op.company_name,
        serviceType: request.service_type,
        serviceTypeDisplay,
        pickupAddress: request.pickup_address,
        dropoffAddress: request.dropoff_address,
        pickupFuzzy: request.pickup_fuzzy || request.pickup_address.split(',')[0],
        dropoffFuzzy: request.dropoff_fuzzy || request.dropoff_address.split(',')[0],
        date: new Date(request.start_date).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
        }),
        time: request.start_time,
        scheduleType: metadata?.schedule_type,
        studentCount: metadata?.student_count,
        requirements,
        requestId,
        claimLink,
        appBaseUrl,
      }),
    });

    // Notify user that we dispatched to an operator
    if (request.user_id) {
      const { data: userProfile } = await supabaseAdmin
        .from('unified_profiles')
        .select('email, full_name')
        .eq('id', request.user_id)
        .maybeSingle();

      if (userProfile?.email) {
        await sendEmail({
          to: userProfile.email,
          ...emailTemplates.adminDispatchedNotification({
            userName: userProfile.full_name || 'there',
            serviceTypeDisplay,
            requestId,
            appBaseUrl,
          }),
        });
      }
    }

    await logEvent({
      event_type: 'operator.manually_onboarded',
      actor_type: 'admin',
      operator_id: operatorId,
      request_id: requestId,
      metadata: {
        onboarding_source: 'manual_dispatch',
        dispatched_by: admin.id,
        is_new_operator: isNewOperator,
        operator_email: op.company_email,
      },
    });

    return NextResponse.json({ success: true, sentTo: op.company_email, operatorId, isNewOperator });
  }

  // ── Admin creates a quote on behalf of an operator ──────────────────────
  if (body.action === 'create_quote') {
    const { requestId, operatorId, price, vehicleType, note } = body;
    if (!requestId || !operatorId || !price || !vehicleType) {
      return NextResponse.json({ error: 'requestId, operatorId, price, and vehicleType are required' }, { status: 400 });
    }

    const { data: request, error: reqError } = await supabaseAdmin
      .from('transport_requests')
      .select('*, user_id')
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const { data: operator, error: opError } = await supabaseAdmin
      .from('operators')
      .select('id, company_name, company_email')
      .eq('id', operatorId)
      .single();

    if (opError || !operator) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }

    // Create quote on operator's behalf
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('quotes')
      .insert({
        request_id: requestId,
        operator_id: operatorId,
        total_price: price,
        vehicle_type: vehicleType,
        note: note || null,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (quoteError || !quote) {
      return NextResponse.json({ error: `Failed to create quote: ${quoteError?.message}` }, { status: 500 });
    }

    // Move request to 'quoted'
    await supabaseAdmin
      .from('transport_requests')
      .update({ status: 'quoted' })
      .eq('id', requestId)
      .eq('status', 'pending');

    // Notify user
    if (request.user_id) {
      const { data: userProfile } = await supabaseAdmin
        .from('unified_profiles')
        .select('email, full_name')
        .eq('id', request.user_id)
        .maybeSingle();

      if (userProfile?.email) {
        const appBaseUrl = getAppBaseUrl();
        await sendEmail({
          to: userProfile.email,
          ...emailTemplates.quoteReceived({
            userName: userProfile.full_name || 'there',
            operatorName: operator.company_name,
            price: Number(price),
            vehicleType,
            requestId,
            quoteId: quote.id,
            appBaseUrl,
          }),
        });
      }
    }

    await logEvent({
      event_type: 'quote.admin_created',
      actor_type: 'admin',
      request_id: requestId,
      metadata: {
        quote_id: quote.id,
        operator_id: operatorId,
        operator_name: operator.company_name,
        price,
        vehicle_type: vehicleType,
        created_by: admin.id,
      },
    });

    return NextResponse.json({ success: true, quoteId: quote.id });
  }

  // ── Bulk create quotes for multiple operators at once ────────────────────
  if (body.action === 'create_quotes_bulk') {
    const { requestId, quotes } = body as {
      requestId: string;
      quotes: { operatorId: string; price: number; vehicleType: string; note?: string }[];
    };

    if (!requestId || !Array.isArray(quotes) || quotes.length === 0) {
      return NextResponse.json({ error: 'requestId and a non-empty quotes array are required' }, { status: 400 });
    }

    const { data: request, error: reqError } = await supabaseAdmin
      .from('transport_requests')
      .select('*, user_id')
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Fetch all referenced operators in one query
    const operatorIds = quotes.map(q => q.operatorId);
    const { data: operators, error: opError } = await supabaseAdmin
      .from('operators')
      .select('id, company_name, company_email')
      .in('id', operatorIds);

    if (opError || !operators || operators.length !== operatorIds.length) {
      return NextResponse.json({ error: 'One or more operators not found' }, { status: 404 });
    }

    const operatorMap = Object.fromEntries(operators.map(op => [op.id, op]));

    // Insert all quotes in one batch
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const quoteInserts = quotes.map(q => ({
      request_id: requestId,
      operator_id: q.operatorId,
      total_price: q.price,
      vehicle_type: q.vehicleType,
      note: q.note || null,
      status: 'pending',
      expires_at: expiresAt,
    }));

    const { data: createdQuotes, error: quoteError } = await supabaseAdmin
      .from('quotes')
      .insert(quoteInserts)
      .select('id, operator_id');

    if (quoteError || !createdQuotes) {
      return NextResponse.json({ error: `Failed to create quotes: ${quoteError?.message}` }, { status: 500 });
    }

    // Move request to 'quoted' once
    await supabaseAdmin
      .from('transport_requests')
      .update({ status: 'quoted' })
      .eq('id', requestId)
      .eq('status', 'pending');

    // Send one consolidated email to the user
    if (request.user_id) {
      const { data: userProfile } = await supabaseAdmin
        .from('unified_profiles')
        .select('email, full_name')
        .eq('id', request.user_id)
        .maybeSingle();

      if (userProfile?.email) {
        const appBaseUrl = getAppBaseUrl();
        const bulkQuoteData = quotes.map(q => ({
          operatorName: operatorMap[q.operatorId].company_name,
          price: q.price,
          vehicleType: q.vehicleType,
          note: q.note,
        }));

        await sendEmail({
          to: userProfile.email,
          ...emailTemplates.quotesBulkReceived({
            userName: userProfile.full_name || 'there',
            requestId,
            quotes: bulkQuoteData,
            appBaseUrl,
          }),
        });
      }
    }

    await logEvent({
      event_type: 'quote.admin_bulk_created',
      actor_type: 'admin',
      request_id: requestId,
      metadata: {
        quote_ids: createdQuotes.map(q => q.id),
        operator_ids: operatorIds,
        count: quotes.length,
        created_by: admin.id,
      },
    });

    return NextResponse.json({ success: true, quoteIds: createdQuotes.map(q => q.id) });
  }

  // ── Admin manually sends user PII to operator ─────────────────────────────
  if (body.action === 'send_operator_details') {
    const { bookingId } = body;
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select(`
        id, confirmation_code, amount,
        request_id, operator_id, user_id,
        transport_requests ( service_type, pickup_address, dropoff_address, start_date, start_time, metadata_private ),
        quotes ( vehicle_type ),
        operators ( company_name, company_email )
      `)
      .eq('id', bookingId)
      .eq('requires_manual_exchange', true)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found or already exchanged' }, { status: 404 });
    }

    const request = (booking as any).transport_requests;
    const operator = (booking as any).operators;
    const quote = (booking as any).quotes;
    const metaPrivate = request?.metadata_private || {};

    // Gather user PII
    const { data: userProfile } = await supabaseAdmin
      .from('unified_profiles')
      .select('full_name, email, phone')
      .eq('id', booking.user_id)
      .maybeSingle();

    const parentName = metaPrivate.parent_name || metaPrivate.patient_name || metaPrivate.contact_name || userProfile?.full_name || 'Unknown';
    const parentEmail = metaPrivate.parent_email || metaPrivate.contact_email || userProfile?.email || '';
    const parentPhone = metaPrivate.parent_phone || metaPrivate.contact_phone || userProfile?.phone || '';

    const appBaseUrl = getAppBaseUrl();

    await sendEmail({
      to: operator.company_email,
      ...emailTemplates.operatorOrderDetails({
        operatorName: operator.company_name,
        parentName,
        parentEmail,
        parentPhone,
        quoteAmount: Number(booking.amount),
        pickup: request.pickup_address,
        dropoff: request.dropoff_address,
        date: new Date(request.start_date).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
        }),
        time: request.start_time,
        vehicleType: quote?.vehicle_type || '',
        confirmationCode: booking.confirmation_code,
        bookingId: booking.id,
        appBaseUrl,
      }),
    });

    // Mark exchange as complete
    await supabaseAdmin
      .from('bookings')
      .update({ requires_manual_exchange: false })
      .eq('id', bookingId);

    await logEvent({
      event_type: 'admin.pii_exchange.sent',
      actor_type: 'admin',
      request_id: booking.request_id,
      metadata: {
        booking_id: bookingId,
        operator_id: booking.operator_id,
        sent_to: operator.company_email,
        sent_by: admin.id,
      },
    });

    return NextResponse.json({ success: true, sentTo: operator.company_email });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
