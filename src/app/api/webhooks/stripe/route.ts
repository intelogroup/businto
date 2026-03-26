// H2: This webhook handler has been consolidated into /api/payments/webhook/route.ts
// to prevent duplicate event processing.
//
// If your Stripe Dashboard still points to this endpoint, update it to:
//   /api/payments/webhook
//
// This stub forwards any events it receives to the canonical handler.

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Forward to the canonical webhook handler
  const url = new URL('/api/payments/webhook', request.url);
  const body = await request.text();

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'stripe-signature': request.headers.get('stripe-signature') || '',
      'content-type': 'text/plain',
    },
    body,
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
