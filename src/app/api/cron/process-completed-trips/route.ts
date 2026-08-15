import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendEmail, emailTemplates, getAppBaseUrl } from '@/lib/email';
import { logEvent } from '@/lib/event-logger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        // Vercel Cron only auto-injects the bearer token for a var literally named
        // CRON_SECRET; VERCEL_CRON_SECRET is kept as a fallback in case that's what's
        // actually configured in the live project.
        const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const now = new Date();
        // A trip is considered ready for follow-up 24 hours after the start_date
        // (or end_date if it's a multi-day trip)
        const targetDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
        const targetDateString = targetDate.toISOString().split('T')[0];

        // Process 1: Find bookings that should be completed
        // We look for bookings where status is 'confirmed' or 'in_progress', 
        // and the related transport_request's date is <= targetDate
        const { data: bookingsToFollowUp, error: fetchErr } = await supabaseAdmin
            .from('bookings')
            .select(`
                id,
                status,
                request_id,
                user:profiles!bookings_user_id_fkey (id, email, full_name),
                operator:operators!bookings_operator_id_fkey (id, company_name),
                request:transport_requests (id, start_date, end_date, start_time)
            `)
            .in('status', ['confirmed', 'in_progress'])
            // Ideally we do the join filtering in Supabase, but PostgREST syntax for joined table filtering 
            // can be complex. We will fetch a broader set and filter in memory, or use a specific view.
            // For safety and simplicity on a cron, we'll fetch all active bookings and filter.
            // In a huge DB, you'd create a Postgres View or RPC.
            .order('created_at', { ascending: true });

        if (fetchErr) {
            console.error("Cron fetch error for completed trips:", fetchErr);
            return NextResponse.json({ error: fetchErr.message }, { status: 500 });
        }

        let followUpsSent = 0;

        for (const booking of bookingsToFollowUp || []) {
            // PostgREST returns joined relations as arrays or single objects depending on cardinality.
            // Unwrap them safely before use.
            const user = Array.isArray(booking.user) ? booking.user[0] : booking.user;
            const request = Array.isArray(booking.request) ? booking.request[0] : booking.request;
            const operator = Array.isArray(booking.operator) ? booking.operator[0] : booking.operator;

            if (!request || !user?.email) continue;

            const effectiveEndDate = request.end_date || request.start_date;
            
            // Check if the effective end date is 24 hours in the past
            if (effectiveEndDate <= targetDateString) {
                console.log(`Processing completed trip follow-up for booking ${booking.id}...`);

                try {
                    // 1. Update statuses FIRST to prevent duplicate emails on retry.
                    // If the cron re-runs before email sends, the status change ensures
                    // this booking won't be picked up again.
                    await supabaseAdmin
                        .from('bookings')
                        .update({ status: 'completed' })
                        .eq('id', booking.id);

                    await supabaseAdmin
                        .from('transport_requests')
                        .update({ status: 'completed' })
                        .eq('id', request.id);

                    // 2. Send follow-up email (after status update for idempotency)
                    await sendEmail({
                        to: user.email,
                        ...emailTemplates.tripCompletedFollowUp({
                            userName: user.full_name || 'Customer',
                            operatorName: operator?.company_name || 'your operator',
                            date: new Date(request.start_date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            }),
                            requestId: request.id,
                        })
                    });

                    // 3. Log event
                    await logEvent({
                        event_type: 'booking.follow_up.sent',
                        actor_type: 'system',
                        user_id: user.id,
                        operator_id: operator?.id,
                        request_id: request.id,
                        booking_id: booking.id,
                    });

                    followUpsSent++;
                } catch (err) {
                    console.error(`Failed to process follow-up for booking ${booking.id}:`, err);
                }
            }
        }

        // Process 2: Auto-cancel expired requests
        // Requests are expired if: trip date already passed, OR request is 14 days old with no booking
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];

        const { data: expiredRequests, error: expiredErr } = await supabaseAdmin
            .from('transport_requests')
            .select('id, service_type, user_id, created_at, start_date, metadata_private, profiles!transport_requests_user_id_fkey(email, full_name)')
            .in('status', ['pending', 'quoted'])
            .or(`start_date.lte.${yesterday},created_at.lte.${fourteenDaysAgo}`);

        if (expiredErr) {
            console.error('Cron fetch error for expired requests:', expiredErr);
        }

        const serviceTypeMap: Record<string, string> = {
            school: 'School Transportation',
            medical: 'Medical Transportation',
            wedding: 'Event Shuttle',
            corporate: 'Corporate Travel',
        };

        let expiredCount = 0;
        const appBaseUrl = getAppBaseUrl();

        for (const req of expiredRequests || []) {
            // M3: Skip requests flagged for manual allocation — admin needs to
            // handle these directly. Auto-cancelling defeats the safety valve.
            if (req.metadata_private?.requires_manual_allocation) {
                continue;
            }

            try {
                // Update status FIRST for idempotency — prevents duplicate
                // expiration emails if cron re-runs before email completes.
                await supabaseAdmin
                    .from('transport_requests')
                    .update({ status: 'cancelled' })
                    .eq('id', req.id);

                const profile = Array.isArray(req.profiles) ? req.profiles[0] : req.profiles;
                if (profile?.email) {
                    await sendEmail({
                        to: profile.email,
                        ...emailTemplates.requestExpired({
                            userName: profile.full_name || 'there',
                            serviceTypeDisplay: serviceTypeMap[req.service_type] || req.service_type,
                            appBaseUrl,
                        }),
                    });
                }

                await logEvent({
                    event_type: 'request.expired.auto_cancelled',
                    actor_type: 'system',
                    request_id: req.id,
                    metadata: {
                        start_date: req.start_date,
                        created_at: req.created_at,
                    },
                });

                expiredCount++;
            } catch (err) {
                console.error(`Failed to cancel expired request ${req.id}:`, err);
            }
        }

        return NextResponse.json({
            success: true,
            followUpsSent,
            expiredCount,
            timestamp: now.toISOString()
        });

    } catch (err: any) {
        console.error("Cron unhandled error processing completed trips:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
