import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireAdmin } from '@/lib/supabase/admin';
import { sendEmail, emailTemplates, getAppBaseUrl } from '@/lib/email';
import { generateOperatorQuoteLink } from '@/lib/email-helpers';
import { extractRequirements } from '@/lib/operator-matching';
import { logEvent } from '@/lib/event-logger';
import {
  parseBooleanField,
  parsePlainObject,
  parsePositiveNumber,
  parseStringArray,
  parseTextField,
} from '@/lib/boundary';
import { isOpenRequestStatus } from '@/lib/request-status';

// ── Shared dispatch validation (BUS-D1) ────────────────────────────────────
// One validation pass serves every action below, built on the
// parse-once-or-refuse parsers in src/lib/boundary.ts — the same
// discipline the operator-side validateQuote boundary already holds.
// A quote entry is a plain object whose price is a positive finite
// NUMBER, whose vehicleType is a non-empty string, and whose note is
// a string when present (BUS-DISPATCH-QUOTE-PRICE-SHAPE-001,
// BUS-DISPATCH-QUOTE-ENTRY-SHAPE-001, BUS-DISPATCH-QUOTE-NOTE-SHAPE-001,
// BUS-DISPATCH-QUOTE-VEHICLE-SHAPE-001). Any other shape is refused
// 400 before any row is fetched for writing or any insert happens.
type QuoteFields = {
  operatorId: string;
  price: number;
  vehicleType: string;
  note: string | null;
};

function parseQuoteEntry(
  entry: unknown
): { ok: true; value: QuoteFields } | { ok: false; error: string } {
  const obj = parsePlainObject(entry, 'quote');
  if (!obj.ok) return obj;
  const q = obj.value;

  if (typeof q.operatorId !== 'string' || q.operatorId.length === 0) {
    return { ok: false, error: 'operatorId is required for each quote' };
  }
  const price = parsePositiveNumber(q.price, 'price');
  if (!price.ok) return price;
  const vehicleType = parseTextField(q.vehicleType, 'vehicleType');
  if (!vehicleType.ok) return vehicleType;
  if (vehicleType.value.length === 0) {
    return { ok: false, error: 'vehicleType is required for each quote' };
  }
  let note: string | null = null;
  if (q.note !== undefined && q.note !== null) {
    const parsedNote = parseTextField(q.note, 'note');
    if (!parsedNote.ok) return parsedNote;
    note = parsedNote.value || null;
  }
  return {
    ok: true,
    value: {
      operatorId: q.operatorId,
      price: price.value,
      vehicleType: vehicleType.value,
      note,
    },
  };
}

// The fuzzy display head of a stored address: the stored fuzzy value
// when it is a string, else the address's first comma segment. A
// stored request whose address is missing (null / non-string) and
// which has no fuzzy value yields null — the caller refuses
// controlled instead of throwing on `.split` of a non-string
// (BUS-DISPATCH-SEND-ADDRESS-SHAPE-001).
function addressHead(fuzzy: unknown, address: unknown): string | null {
  if (typeof fuzzy === 'string' && fuzzy) return fuzzy;
  if (typeof address === 'string' && address) return address.split(',')[0];
  return null;
}

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
    // BOUNDARY (BUS-DISPATCH-TOGGLE-SHAPE-001): `enabled` is a boolean
    // before it is stored — any other shape was upserted verbatim, so
    // a stored string "true" read back OFF under the GET branch's
    // `value === true` while the audit log took the enabled branch.
    const parsedEnabled = parseBooleanField(body.enabled, 'enabled');
    if (!parsedEnabled.ok) {
      return NextResponse.json({ error: parsedEnabled.error }, { status: 400 });
    }
    const enabled = parsedEnabled.value;

    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert({ key: 'manual_dispatch_mode', value: enabled, updated_at: new Date().toISOString() });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logEvent({
      event_type: enabled ? 'admin.manual_dispatch.enabled' : 'admin.manual_dispatch.disabled',
      actor_type: 'admin',
      metadata: { toggled_by: admin.id },
    });

    return NextResponse.json({ manualDispatchMode: enabled });
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

    // LIFECYCLE GUARD (BUS-DISPATCH-SEND-CLOSED-001): a dispatch email
    // may be sent only for an open request — the shared guard the
    // quotes family uses. This branch never read request.status, so
    // cancelled/completed/booked requests got a claim link and an
    // operator email (the create_quote branches below refuse them).
    if (!isOpenRequestStatus(request.status)) {
      return NextResponse.json({ error: `Cannot dispatch. Request is already ${request.status}.` }, { status: 400 });
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

    // BOUNDARY (BUS-DISPATCH-SEND-ADDRESS-SHAPE-001): the email's
    // address heads come from addressHead(), never from a bare
    // `.split(',')` on the stored address — a stored request with a
    // null address and no fuzzy value is refused controlled, with no
    // email sent, instead of throwing an uncaught TypeError.
    const pickupFuzzy = addressHead(request.pickup_fuzzy, request.pickup_address);
    const dropoffFuzzy = addressHead(request.dropoff_fuzzy, request.dropoff_address);
    if (pickupFuzzy === null || dropoffFuzzy === null) {
      return NextResponse.json({ error: 'Request is missing a pickup or dropoff address' }, { status: 400 });
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
        pickupAddress: typeof request.pickup_address === 'string' ? request.pickup_address : pickupFuzzy,
        dropoffAddress: typeof request.dropoff_address === 'string' ? request.dropoff_address : dropoffFuzzy,
        pickupFuzzy,
        dropoffFuzzy,
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
    const { requestId } = body;
    if (!requestId || !body.operator) {
      return NextResponse.json({ error: 'requestId, company_name, company_email, and company_phone are required' }, { status: 400 });
    }

    // BOUNDARY (BUS-DISPATCH-ONBOARD-OPERATOR-SHAPE-001): the operator
    // fields are non-empty STRINGS before anything is created — they
    // used to be truthiness-guarded only, so numeric/boolean/array/
    // object shapes flowed verbatim into auth-user creation, the
    // profiles upsert, the operators insert, and the dispatch email
    // recipient. Refusal happens before any auth user, operator row,
    // or email exists.
    const parsedOperator = parsePlainObject(body.operator, 'operator');
    if (!parsedOperator.ok) {
      return NextResponse.json({ error: parsedOperator.error }, { status: 400 });
    }
    const opRaw = parsedOperator.value;
    for (const field of ['company_name', 'company_email', 'company_phone'] as const) {
      const parsedField = parseTextField(opRaw[field], field);
      if (!parsedField.ok || parsedField.value.length === 0) {
        return NextResponse.json({ error: `${field} must be a non-empty string` }, { status: 400 });
      }
    }
    if (opRaw.vehicle_types !== undefined && opRaw.vehicle_types !== null) {
      const parsedTypes = parseStringArray(opRaw.vehicle_types, 'vehicle_types');
      if (!parsedTypes.ok) {
        return NextResponse.json({ error: parsedTypes.error }, { status: 400 });
      }
    }
    if (opRaw.is_partner !== undefined && opRaw.is_partner !== null) {
      const parsedPartner = parseBooleanField(opRaw.is_partner, 'is_partner');
      if (!parsedPartner.ok) {
        return NextResponse.json({ error: parsedPartner.error }, { status: 400 });
      }
    }
    const op = opRaw as {
      company_name: string;
      company_email: string;
      company_phone: string;
      vehicle_types?: string[];
      is_partner?: boolean;
    };

    // Fetch request
    const { data: request, error: reqError } = await supabaseAdmin
      .from('transport_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // LIFECYCLE GUARD (BUS-DISPATCH-SEND-CLOSED-001): same open-request
    // guard as the send branch — refuse a closed request before any
    // operator is created, any claim link generated, or any email sent.
    if (!isOpenRequestStatus(request.status)) {
      return NextResponse.json({ error: `Cannot dispatch. Request is already ${request.status}.` }, { status: 400 });
    }

    // BOUNDARY (BUS-DISPATCH-SEND-ADDRESS-SHAPE-001): same addressHead
    // discipline as the send branch, checked here — before any
    // operator is created — so a request with a missing address fails
    // controlled with no side effects at all.
    const pickupFuzzy = addressHead(request.pickup_fuzzy, request.pickup_address);
    const dropoffFuzzy = addressHead(request.dropoff_fuzzy, request.dropoff_address);
    if (pickupFuzzy === null || dropoffFuzzy === null) {
      return NextResponse.json({ error: 'Request is missing a pickup or dropoff address' }, { status: 400 });
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
        pickupAddress: typeof request.pickup_address === 'string' ? request.pickup_address : pickupFuzzy,
        dropoffAddress: typeof request.dropoff_address === 'string' ? request.dropoff_address : dropoffFuzzy,
        pickupFuzzy,
        dropoffFuzzy,
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

    // BOUNDARY (BUS-D1): the shared quote-entry parse — price was
    // truthiness-guarded only and inserted verbatim, so a string,
    // negative, boolean, or array price became a live pending quote;
    // vehicleType and note flowed the same way. All three are parsed
    // (or refused 400) before any fetch or insert.
    const parsedQuote = parseQuoteEntry({ operatorId, price, vehicleType, note });
    if (!parsedQuote.ok) {
      return NextResponse.json({ error: parsedQuote.error }, { status: 400 });
    }
    const quoteFields = parsedQuote.value;

    const { data: request, error: reqError } = await supabaseAdmin
      .from('transport_requests')
      .select('*, user_id')
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    if (['booked', 'completed', 'canceled', 'cancelled'].includes(request.status)) {
      return NextResponse.json({ error: `Cannot create quote. Request is already ${request.status}.` }, { status: 400 });
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
        total_price: quoteFields.price,
        vehicle_type: quoteFields.vehicleType,
        note: quoteFields.note,
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
            price: quoteFields.price,
            vehicleType: quoteFields.vehicleType,
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
        price: quoteFields.price,
        vehicle_type: quoteFields.vehicleType,
        created_by: admin.id,
      },
    });

    return NextResponse.json({ success: true, quoteId: quote.id });
  }

  // ── Bulk create quotes for multiple operators at once ────────────────────
  if (body.action === 'create_quotes_bulk') {
    const { requestId, quotes } = body as {
      requestId: string;
      quotes: unknown[];
    };

    if (!requestId || !Array.isArray(quotes) || quotes.length === 0) {
      return NextResponse.json({ error: 'requestId and a non-empty quotes array are required' }, { status: 400 });
    }

    // BOUNDARY (BUS-D1): every entry goes through the shared
    // quote-entry parse BEFORE any fetch or insert — this branch had
    // no per-entry guard at all, so a null entry crashed the map with
    // an uncaught TypeError and string/negative/boolean/array prices,
    // notes, and vehicle types were inserted verbatim. One bad entry
    // refuses the whole batch 400; nothing is inserted.
    const parsedQuotes: QuoteFields[] = [];
    for (const entry of quotes) {
      const parsedEntry = parseQuoteEntry(entry);
      if (!parsedEntry.ok) {
        return NextResponse.json({ error: parsedEntry.error }, { status: 400 });
      }
      parsedQuotes.push(parsedEntry.value);
    }

    const { data: request, error: reqError } = await supabaseAdmin
      .from('transport_requests')
      .select('*, user_id')
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    if (['booked', 'completed', 'canceled', 'cancelled'].includes(request.status)) {
      return NextResponse.json({ error: `Cannot create quotes. Request is already ${request.status}.` }, { status: 400 });
    }

    // Fetch all referenced operators in one query
    const operatorIds = parsedQuotes.map(q => q.operatorId);
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
    const quoteInserts = parsedQuotes.map(q => ({
      request_id: requestId,
      operator_id: q.operatorId,
      total_price: q.price,
      vehicle_type: q.vehicleType,
      note: q.note,
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
        const bulkQuoteData = parsedQuotes.map(q => ({
          operatorName: operatorMap[q.operatorId].company_name,
          price: q.price,
          vehicleType: q.vehicleType,
          note: q.note ?? undefined,
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

    // BOUNDARY (BUS-DISPATCH-SEND-DETAILS-SHAPE-001): the joined rows
    // are checked for null BEFORE anything is dereferenced — a
    // booking whose transport_requests or operators row was deleted
    // after booking used to throw an uncaught TypeError on
    // request.pickup_address / operator.company_email, mid-PII-path.
    // Refuse controlled (409): no email is built or sent and
    // requires_manual_exchange stays true for a human to resolve.
    if (!request || !operator) {
      return NextResponse.json({ error: 'Booking references a missing request or operator; details cannot be sent' }, { status: 409 });
    }

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
