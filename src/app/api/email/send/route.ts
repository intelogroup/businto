import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, emailTemplates } from '@/lib/email';
import { requireUser } from '@/lib/supabase/admin';
import { parseTextField } from '@/lib/boundary';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authentication — prevents unauthenticated email sending abuse.
    // This route is only used by the test-email page, but was previously open to anyone.
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // BOUNDARY (BUS-EMAIL-SEND-TYPE-SHAPE-001): the fields are
    // strings before they are used — a non-string `type` previously
    // passed the truthiness check below and escaped as a 500
    // TypeError at type.replace(...). A supplied field in any other
    // shape is refused 400, never coerced, never sent.
    for (const [value, field] of [
      [body.type, 'type'],
      [body.to, 'to'],
      [body.data?.userEmail, 'data.userEmail'],
    ] as const) {
      if (value === undefined) continue;
      const parsed = parseTextField(value, field);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
    }

    // Support both formats: {type, to, data} and {type, data: {userEmail, ...}}
    const type = body.type;
    const to = body.to || body.data?.userEmail;
    const data = body.data;

    if (!type || !to || !data) {
      return NextResponse.json(
        { error: 'Missing type, to/userEmail, or data' },
        { status: 400 }
      );
    }

    // SECURITY (BUS-EMAIL-SPOOF-001): this route renders platform-branded
    // templates, so the recipient must be the authenticated caller's own
    // email address — in either format (top-level `to` or nested
    // `data.userEmail`). Previously any signed-in account could send
    // platform mail with caller-chosen content to arbitrary recipients.
    const callerEmail = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (!callerEmail || String(to).trim().toLowerCase() !== callerEmail) {
      return NextResponse.json(
        { error: 'Recipient must be your own email address' },
        { status: 403 }
      );
    }

    let template;
    // Support both underscore and hyphen formats
    const normalizedType = type.replace(/-/g, '_');
    
    switch (normalizedType) {
      case 'request_confirmation':
        template = emailTemplates.requestConfirmation(data);
        break;
      case 'quote_received':
        template = emailTemplates.quoteReceived(data);
        break;
      case 'quote_accepted':
        template = emailTemplates.operatorOrderDetails(data);
        break;
      case 'booking_confirmation':
        template = emailTemplates.bookingConfirmation(data);
        break;
      case 'payment_success':
        template = emailTemplates.paymentSuccess(data);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid email type' },
          { status: 400 }
        );
    }

    const result = await sendEmail({
      to,
      subject: template.subject,
      html: template.html
    });

    return NextResponse.json({ 
      success: true, 
      messageId: result?.id,
      previewUrl: result?.previewUrl 
    });
  } catch (error: unknown) {
    console.error('Error sending email:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to send email';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
