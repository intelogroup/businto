import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { findMatchingOperators, extractRequirements } from '@/lib/operator-matching';
import { sendEmail, emailTemplates, getAppBaseUrl } from '@/lib/email';
import { generateOperatorViewToken } from '@/lib/tokens';
import { logEvent } from '@/lib/event-logger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        // Basic verification prioritizing VERCEL_CRON_SECRET
        if (
            process.env.VERCEL_ENV === 'production' &&
            process.env.VERCEL_CRON_SECRET &&
            authHeader !== `Bearer ${process.env.VERCEL_CRON_SECRET}`
        ) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Process 1: Leak to Standard Network
        // Find pending requests that haven't been leaked AND priority window has expired
        const now = new Date();
        const { data: leakRequests, error: leakErr } = await supabaseAdmin
            .from('transport_requests')
            .select('*')
            .eq('status', 'pending')
            .eq('notified_standard_network', false)
            .lte('priority_window_ends_at', now.toISOString());

        if (leakErr) {
            console.error("Cron fetch error for leaking:", leakErr);
            return NextResponse.json({ error: leakErr.message }, { status: 500 });
        }

        let notifiedStandard = 0;

        for (const request of leakRequests || []) {
            console.log(`Leaking request ${request.id} to standard network...`);

            const operators = await findMatchingOperators({
                service_type: request.service_type,
                pickup_address: request.pickup_address,
                pickup_fuzzy: request.pickup_fuzzy,
                dropoff_address: request.dropoff_address,
                dropoff_fuzzy: request.dropoff_fuzzy,
                metadata: request.metadata
            });

            // We only notify non-partners in this phase since partners were already notified
            const freeOperators = operators.filter(o => !o.is_partner);

            if (freeOperators.length > 0) {
                const requirements = extractRequirements(request.service_type, request.metadata);
                const appBaseUrl = getAppBaseUrl();
                const serviceTypeMap: Record<string, string> = {
                    school: 'School Transportation',
                    medical: 'Medical Transportation',
                    wedding: 'Event Shuttle',
                    corporate: 'Corporate Travel'
                };
                const serviceTypeDisplay = serviceTypeMap[request.service_type] || request.service_type;

                for (const operator of freeOperators) {
                    try {
                        const accessToken = await generateOperatorViewToken(request.id, operator.id, 'quote', 7);

                        const emailResult = await sendEmail({
                            to: operator.company_email,
                            headers: { 'X-Mailin-Tag': 'operator-new-request' },
                            ...emailTemplates.operatorNewRequest({
                                operatorName: operator.company_name,
                                serviceType: request.service_type,
                                serviceTypeDisplay,
                                pickupAddress: request.pickup_address,
                                dropoffAddress: request.dropoff_address,
                                pickupFuzzy: request.pickup_fuzzy || request.pickup_address.split(',')[0],
                                dropoffFuzzy: request.dropoff_fuzzy || request.dropoff_address.split(',')[0],
                                date: new Date(request.start_date).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                }),
                                time: request.start_time,
                                scheduleType: request.metadata?.schedule_type,
                                studentCount: request.metadata?.student_count,
                                requirements,
                                requestId: request.id,
                                accessToken,
                                appBaseUrl
                            })
                        });

                        await logEvent({
                            event_type: 'operator.request_email.sent',
                            actor_type: 'system',
                            operator_id: operator.id,
                            request_id: request.id,
                            metadata: {
                                operator_name: operator.company_name,
                                to: operator.company_email,
                                message_id: emailResult?.id,
                                is_partner: operator.is_partner,
                                phase: 'standard_network_leak'
                            },
                        });

                        // Create in-app notification
                        await supabaseAdmin.from('notifications').insert({
                            user_id: operator.profile_id,
                            type: 'new_request_available',
                            title: `New ${serviceTypeDisplay} Request`,
                            message: `${request.pickup_fuzzy || request.pickup_address.split(',')[0]} → ${request.dropoff_fuzzy || request.dropoff_address.split(',')[0]}`,
                            data: {
                                request_id: request.id,
                                service_type: request.service_type,
                                pickup_fuzzy: request.pickup_fuzzy || request.pickup_address.split(',')[0],
                                dropoff_fuzzy: request.dropoff_fuzzy || request.dropoff_address.split(',')[0]
                            }
                        });

                    } catch (err) {
                        console.error(`Failed to notify standard operator ${operator.company_name}:`, err);
                    }
                }
                console.log(`Notified ${freeOperators.length} standard operators for request ${request.id}.`);
            }

            // Mark as notified even if there were 0 free operators to prevent endless looping
            await supabaseAdmin.from('transport_requests').update({ notified_standard_network: true }).eq('id', request.id);
            notifiedStandard++;
        }

        // Process 2: Admin Safety Valve Alert
        // Find medical pending requests older than 30 mins that haven't triggered an admin alert
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

        const { data: alertRequests, error: alertErr } = await supabaseAdmin
            .from('transport_requests')
            .select('*')
            .eq('status', 'pending')
            .eq('service_type', 'medical')
            .eq('admin_alerted', false)
            .lte('created_at', thirtyMinsAgo);

        if (alertErr) {
            console.error("Cron fetch error for admin alerts:", alertErr);
            return NextResponse.json({ error: alertErr.message }, { status: 500 });
        }

        let alertsSent = 0;

        for (const request of alertRequests || []) {
            console.log(`⚠️ Safety Valve Triggered for Care Ride ${request.id}`);
            try {
                await sendEmail({
                    to: process.env.ADMIN_EMAIL || 'admin@businto.com',
                    subject: `URGENT: Care Ride Unassigned > 30 Mins (#${request.id.substring(0, 8)})`,
                    html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2 style="color: #ef4444;">Action Required: Care Ride Safety Valve</h2>
              <p>A Care Ride has been pending and unmatched/unaccepted for over 30 minutes.</p>
              <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Request ID:</strong> ${request.id}</p>
                <p><strong>Pickup:</strong> ${request.pickup_address}</p>
                <p><strong>Dropoff:</strong> ${request.dropoff_address}</p>
                <p><strong>Created:</strong> ${new Date(request.created_at).toLocaleString()}</p>
              </div>
              <p>Please log in immediately to review available operators and assign manually to protect the Businto brand.</p>
              <a href="${getAppBaseUrl()}/admin" style="display: inline-block; background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Go to Admin Dashboard</a>
            </div>
          `
                });

                await supabaseAdmin.from('transport_requests').update({ admin_alerted: true }).eq('id', request.id);

                await logEvent({
                    event_type: 'request.manual_allocation.flagged',
                    actor_type: 'system',
                    request_id: request.id,
                    metadata: { reason: "Care ride 30-min safety valve" }
                });

                alertsSent++;
            } catch (err) {
                console.error(`Failed to send safety valve alert for ${request.id}:`, err);
            }
        }

        return NextResponse.json({
            success: true,
            leakedRequests: notifiedStandard,
            safetyAlerts: alertsSent,
            timestamp: now.toISOString()
        });

    } catch (err: any) {
        console.error("Cron unhandled error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
