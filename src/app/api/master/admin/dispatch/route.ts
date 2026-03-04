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

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
