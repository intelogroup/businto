import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendEmail, emailTemplates } from '@/lib/email';
import { findMatchingOperators, extractRequirements } from '@/lib/operator-matching';
import { splitAndValidateMetadata, detectPrivateFieldsInSafe } from '@/lib/validation-split';
import { generateOperatorViewToken } from '@/lib/tokens';
import { logEvent } from '@/lib/event-logger';

export async function POST(request: NextRequest) {
  try {
    const appBaseUrl = new URL(request.url).origin;
    const body = await request.json();
    const {
      service_type,
      pickup_address,
      dropoff_address,
      pickup_fuzzy,
      dropoff_fuzzy,
      start_date,
      start_time,
      end_date,
      is_recurring,
      recurrence_pattern,
      metadata,
      user_id
    } = body;

    if (!service_type || !pickup_address || !dropoff_address || !start_date) {
      return NextResponse.json(
        { error: 'Missing required fields: service_type, pickup_address, dropoff_address, start_date' },
        { status: 400 }
      );
    }

    // Validate service type
    if (!['school', 'medical', 'wedding', 'corporate'].includes(service_type)) {
      return NextResponse.json(
        { error: `Invalid service_type: ${service_type}` },
        { status: 400 }
      );
    }

    // CRITICAL: Split and validate metadata with fail-closed approach
    let metadata_safe = {};
    let metadata_private = {};

    if (metadata && Object.keys(metadata).length > 0) {
      try {
        const split = splitAndValidateMetadata(metadata, service_type);
        metadata_safe = split.metadata_safe;
        metadata_private = split.metadata_private;

        // Extra safety check: detect if any private-looking fields leaked
        const leaked = detectPrivateFieldsInSafe(metadata_safe, service_type);
        if (leaked.length > 0) {
          console.error('🔴 SECURITY VIOLATION: Private fields in safe metadata:', leaked);
          return NextResponse.json(
            { error: `Security violation: fields ${leaked.join(', ')} cannot be in safe metadata` },
            { status: 400 }
          );
        }

      } catch (validationError: any) {
        console.error('Metadata validation failed:', validationError);
        return NextResponse.json(
          { error: `Metadata validation failed: ${validationError.message}` },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from('transport_requests')
      .insert({
        service_type,
        pickup_address,
        dropoff_address,
        pickup_fuzzy: pickup_fuzzy || pickup_address.split(',')[0],
        dropoff_fuzzy: dropoff_fuzzy || dropoff_address.split(',')[0],
        start_date,
        start_time,
        end_date,
        is_recurring: is_recurring || false,
        recurrence_pattern,
        metadata_safe,
        metadata_private,
        // Keep old metadata field for backward compat during transition
        metadata: metadata || {},
        user_id,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logEvent({
      event_type: 'request.created',
      actor_type: user_id ? 'user' : 'system',
      actor_id: user_id || null,
      user_id: user_id || null,
      request_id: data.id,
      metadata: {
        service_type,
        pickup_fuzzy: data.pickup_fuzzy,
        dropoff_fuzzy: data.dropoff_fuzzy,
      },
    });

    // Store email preview URLs to return in response
    const emailPreviewUrls: string[] = [];

    // Send confirmation email (fire and forget - don't block response)
    if (user_id) {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', user_id)
          .single();
        
        if (profileError) {
          console.error('Failed to fetch user profile:', profileError);
        } else if (profile?.email) {
          const serviceTypeMap: Record<string, string> = {
            school: 'School Transportation',
            medical: 'Medical Transportation',
            wedding: 'Event Shuttle'
          };

          try {
            const result = await sendEmail({
              to: profile.email,
              ...emailTemplates.requestConfirmation({
                userName: profile.full_name || 'User',
                serviceType: serviceTypeMap[service_type] || service_type,
                pickupAddress: pickup_fuzzy || pickup_address,
                dropoffAddress: dropoff_fuzzy || dropoff_address,
                date: start_date,
                requestId: data.id,
              })
            });

            await logEvent({
              event_type: 'request.confirmation_email.sent',
              actor_type: 'system',
              user_id: user_id || null,
              request_id: data.id,
              metadata: {
                to: profile.email,
                message_id: result?.id,
              },
            });
          } catch (emailErr) {
            console.error('Failed to send confirmation email:', emailErr);
            await logEvent({
              event_type: 'request.confirmation_email.failed',
              status: 'error',
              actor_type: 'system',
              user_id: user_id || null,
              request_id: data.id,
              message: emailErr instanceof Error ? emailErr.message : 'Unknown email error',
            });
          }
        }
      } catch (err) {
        console.error('Failed to process user confirmation email:', err);
      }
    }

    // Notify matching operators (fire and forget - don't block response)
    findMatchingOperators({
      service_type,
      pickup_address,
      pickup_fuzzy,
      dropoff_address,
      dropoff_fuzzy,
      metadata
    }).then(async (operators) => {
      console.log('\n🔔 ==========================================');
      console.log(`🔔 Notifying ${operators.length} matching operators for request ${data.id}`);
      console.log('🔔 ==========================================\n');
      
      const serviceTypeMap: Record<string, string> = {
        school: 'School Transportation',
        medical: 'Medical Transportation', 
        wedding: 'Event Shuttle'
      };

      const serviceTypeDisplay = serviceTypeMap[service_type] || service_type;
      const requirements = extractRequirements(service_type, metadata);

      // Send email to each matching operator
      for (const operator of operators) {
        try {
          // Generate signed token for operator access (7 day expiry)
          const accessToken = await generateOperatorViewToken(
            data.id,
            operator.id,
            'quote',
            7
          );
          
          const emailResult = await sendEmail({
            to: operator.company_email,
            ...emailTemplates.operatorNewRequest({
              operatorName: operator.company_name,
              serviceType: service_type,
              serviceTypeDisplay,
              pickupAddress: pickup_address,
              dropoffAddress: dropoff_address,
              pickupFuzzy: pickup_fuzzy || pickup_address.split(',')[0],
              dropoffFuzzy: dropoff_fuzzy || dropoff_address.split(',')[0],
              date: new Date(start_date).toLocaleDateString('en-US', { 
                weekday: 'short',
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              }),
              time: start_time,
              scheduleType: metadata?.schedule_type,
              studentCount: metadata?.student_count,
              requirements,
              requestId: data.id,
              accessToken, // Pass token to email template
              appBaseUrl
            })
          });

          await logEvent({
            event_type: 'operator.request_email.sent',
            actor_type: 'system',
            operator_id: operator.id,
            request_id: data.id,
            metadata: {
              operator_name: operator.company_name,
              to: operator.company_email,
              message_id: emailResult?.id,
            },
          });
          
          if (emailResult.previewUrl) {
            emailPreviewUrls.push(emailResult.previewUrl);
          }

          // Create in-app notification for operator
          await supabase.from('notifications').insert({
            user_id: operator.profile_id,
            type: 'new_request_available',
            title: `New ${serviceTypeDisplay} Request`,
            message: `${pickup_fuzzy || pickup_address.split(',')[0]} → ${dropoff_fuzzy || dropoff_address.split(',')[0]}`,
            data: { 
              request_id: data.id,
              service_type,
              pickup_fuzzy: pickup_fuzzy || pickup_address.split(',')[0],
              dropoff_fuzzy: dropoff_fuzzy || dropoff_address.split(',')[0]
            }
          });

          console.log(`✓ Notified operator: ${operator.company_name}`);
        } catch (err) {
          console.error(`Failed to notify operator ${operator.company_name}:`, err);
          await logEvent({
            event_type: 'operator.request_email.failed',
            status: 'error',
            actor_type: 'system',
            operator_id: operator.id,
            request_id: data.id,
            message: err instanceof Error ? err.message : 'Unknown operator notify error',
            metadata: {
              operator_name: operator.company_name,
              to: operator.company_email,
            },
          });
        }
      }

      console.log(`Operator notification complete for request ${data.id}`);
    }).catch((matchErr) => {
      console.error('Failed to match/notify operators:', matchErr);
    });

    // Wait a moment for async emails to be collected
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Return sanitized response - exclude private data
    // Users get their own data, but we follow principle of least privilege
    const sanitizedRequest = {
      id: data.id,
      service_type: data.service_type,
      pickup_fuzzy: data.pickup_fuzzy,
      dropoff_fuzzy: data.dropoff_fuzzy,
      start_date: data.start_date,
      start_time: data.start_time,
      end_date: data.end_date,
      is_recurring: data.is_recurring,
      recurrence_pattern: data.recurrence_pattern,
      metadata_safe: data.metadata_safe,
      status: data.status,
      created_at: data.created_at,
    };

    return NextResponse.json({
      success: true,
      request: sanitizedRequest,
      message: 'Transport request created successfully',
      emailPreviewUrls: emailPreviewUrls.length > 0 ? emailPreviewUrls : undefined
    });
  } catch (error) {
    console.error('Error creating transport request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const status = searchParams.get('status');

    // Select only safe fields - never expose metadata_private or exact addresses
    let query = supabase
      .from('transport_requests')
      .select(`
        id,
        service_type,
        pickup_fuzzy,
        dropoff_fuzzy,
        start_date,
        start_time,
        end_date,
        is_recurring,
        recurrence_pattern,
        metadata_safe,
        status,
        created_at,
        user_id,
        quotes (
          id,
          total_price,
          base_fare,
          distance_charge,
          vehicle_type,
          vehicle_year,
          vehicle_capacity,
          wheelchair_accessible,
          note,
          status,
          created_at,
          operator:profiles!quotes_operator_id_fkey (
            id,
            full_name,
            company_name,
            avatar_url
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ requests: data });
  } catch (error) {
    console.error('Error fetching transport requests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
