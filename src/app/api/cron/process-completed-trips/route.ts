import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendEmail, emailTemplates } from '@/lib/email';
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
                    // 1. Send the follow-up email to the user
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

                    // 2. Update booking status to 'completed'
                    await supabaseAdmin
                        .from('bookings')
                        .update({ status: 'completed' })
                        .eq('id', booking.id);

                    // 3. Update transport request status to 'completed'
                    await supabaseAdmin
                        .from('transport_requests')
                        .update({ status: 'completed' })
                        .eq('id', request.id);

                    // 4. Log event
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

        return NextResponse.json({
            success: true,
            followUpsSent,
            timestamp: now.toISOString()
        });

    } catch (err: any) {
        console.error("Cron unhandled error processing completed trips:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
