import { Resend } from 'resend';
import nodemailer from 'nodemailer'; // dev-only Ethereal fallback
import { maskStreetNumber } from './location-utils';
import {
  validateEmailLinks,
  logEmailSend,
  logLinkValidation,
  type EmailSendLog,
} from './email-logger';

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : undefined;
}

const FROM_EMAIL = env('SMTP_FROM_EMAIL') || 'Businto <noreply@businto.com>';

// Lazy Resend singleton
let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) resendClient = new Resend(env('RESEND_API_KEY')!);
  return resendClient;
}

// Ethereal transporter — only used in dev when RESEND_API_KEY is absent
let etherealTransporter: nodemailer.Transporter | null = null;
let etherealAccount: { user: string; pass: string; smtp: { host: string; port: number; secure: boolean } } | null = null;

async function getEtherealTransporter() {
  if (etherealTransporter) return etherealTransporter;
  if (!etherealAccount) {
    etherealAccount = await nodemailer.createTestAccount();
    console.log('📧 Ethereal fallback active (no RESEND_API_KEY):');
    console.log('   Email:', etherealAccount.user);
  }
  etherealTransporter = nodemailer.createTransport({
    host: etherealAccount.smtp.host,
    port: etherealAccount.smtp.port,
    secure: etherealAccount.smtp.secure,
    auth: { user: etherealAccount.user, pass: etherealAccount.pass },
  });
  return etherealTransporter;
}

/**
 * Helper to get the correct base URL for links in emails.
 * Always prefers the provided URL, then environment variable, then fallback.
 * Forces businto.com in production environments.
 */
export function getAppBaseUrl(providedUrl?: string): string {
  let url = providedUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://businto.com';

  // If we are explicitly testing or in dev, allow localhost/previews
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) return url.replace(/\/$/, "");

  // In any non-development environment, never let a vercel.app preview URL leak into
  // outgoing emails. Force the canonical production domain instead.
  const isVercelProd = process.env.VERCEL_ENV === 'production';
  const isProd = process.env.NODE_ENV === 'production' || isVercelProd;
  if (isProd && url.includes('vercel.app')) {
    url = 'https://businto.com';
  }

  const finalUrl = url.replace(/\/$/, "");
  console.log(`[Email] getAppBaseUrl: ${finalUrl} (provided: ${providedUrl}, env: ${process.env.NEXT_PUBLIC_APP_URL})`);
  return finalUrl;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
  trackingClicks?: boolean;
}

export async function sendEmail({ to, subject, html }: EmailOptions & { forceSmtp?: boolean }) {
  const linkMatches = html.match(/href="([^"]+)"/g) || [];
  const claimLinkFound = linkMatches.some(link => link.includes('/claim/'));

  const linkValidation = validateEmailLinks(html);
  if (!linkValidation.valid) {
    await logLinkValidation(to, linkValidation);
  }

  const apiKey = env('RESEND_API_KEY');

  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not set — using Ethereal preview (dev only)');
    return sendEmailEthereal({ to, subject, html, linkMatches, claimLinkFound });
  }

  console.log(`[Email/Resend] Sending to ${to}: "${subject}"`);

  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) throw new Error(error.message);

    await logEmailSend({
      messageId: data?.id,
      to,
      subject,
      linkCount: linkMatches.length,
      claimLinkFound,
      timestamp: new Date().toISOString(),
      transportType: 'resend',
      trackingDisabled: true,
      status: 'sent',
    });

    console.log(`✅ Email sent via Resend to ${to} (ID: ${data?.id})`);
    return { id: data?.id, previewUrl: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await logEmailSend({
      to,
      subject,
      linkCount: linkMatches.length,
      claimLinkFound,
      timestamp: new Date().toISOString(),
      transportType: 'resend',
      status: 'failed',
      error: errorMessage,
    });
    console.error('💥 Resend email failure:', err);
    throw err;
  }
}

async function sendEmailEthereal({
  to, subject, html, linkMatches, claimLinkFound,
}: EmailOptions & { linkMatches: RegExpMatchArray | string[]; claimLinkFound: boolean }) {
  const transport = await getEtherealTransporter();
  const info = await transport.sendMail({ from: FROM_EMAIL, to, subject, html });
  const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;

  await logEmailSend({
    messageId: info.messageId,
    to,
    subject,
    linkCount: linkMatches.length,
    claimLinkFound,
    timestamp: new Date().toISOString(),
    transportType: 'ethereal',
    trackingDisabled: true,
    previewUrl,
    status: 'sent',
  });

  console.log('\n==============================================');
  console.log(`✅ EMAIL SENT (Ethereal) TO: ${to}`);
  if (previewUrl) {
    console.log('📧 PREVIEW URL:', previewUrl);
    const fs = require('fs');
    const path = require('path');
    fs.appendFileSync(
      path.join(process.cwd(), 'email-preview-urls.txt'),
      `${new Date().toISOString()} - ${to}\n${previewUrl}\n\n`
    );
  }
  console.log('==============================================\n');
  return { id: info.messageId, previewUrl };
}

// Email Templates
export const emailTemplates = {
  requestConfirmation: (data: {
    userName: string;
    serviceType: string;
    pickupAddress: string;
    dropoffAddress: string;
    date: string;
    requestId: string;
    accessToken?: string;
    claimLink?: string;
    appBaseUrl?: string;
  }) => ({
    subject: 'Your Transport Request Has Been Submitted',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px; }
            .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
            .detail-row:last-child { border-bottom: 0; }
            .label { color: #6b7280; font-size: 14px; }
            .value { font-weight: 600; color: #111827; }
            .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Request Submitted!</h1>
            </div>
            <div class="content">
              <p>Hi ${data.userName},</p>
              <p>Your transport request has been submitted successfully. Operators in your area are being notified and will send you quotes shortly.</p>

              <div class="details">
                <div class="detail-row">
                  <span class="label">Service Type</span>
                  <span class="value">${data.serviceType}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Pickup</span>
                  <span class="value">${data.pickupAddress}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Destination</span>
                  <span class="value">${data.dropoffAddress}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Date</span>
                  <span class="value">${data.date}</span>
                </div>
              </div>

              <p>You'll receive an email when operators submit quotes. You can also check your live status for real-time updates.</p>

              <a href="${data.claimLink || `${getAppBaseUrl(data.appBaseUrl)}/trips/${data.requestId}${data.accessToken ? `?token=${encodeURIComponent(data.accessToken)}` : ''}`}" class="button">View Live Status</a>

              <div class="footer">
                <p>&copy; 2026 Businto. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  }),

  quoteReceived: (data: {
    userName: string;
    operatorName: string;
    price: number;
    vehicleType: string;
    requestId: string;
    quoteId: string;
    accessToken?: string;
    claimLink?: string;
    appBaseUrl?: string;
  }) => ({
    subject: `New Quote Received: $${data.price} from ${data.operatorName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px; }
            .quote-card { background: #f0fdf4; border: 2px solid #22c55e; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
            .price { font-size: 36px; font-weight: bold; color: #16a34a; }
            .operator { font-size: 18px; color: #333; margin-top: 10px; }
            .vehicle { color: #6b7280; font-size: 14px; }
            .button { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Quote Received!</h1>
            </div>
            <div class="content">
              <p>Hi ${data.userName},</p>
              <p>Great news! An operator has submitted a quote for your transport request.</p>

              <div class="quote-card">
                <div class="price">${data.price === 0 ? 'Estimate (TBD)' : `$${data.price.toFixed(2)}`}</div>
                <div class="operator">${data.operatorName}</div>
                <div class="vehicle">${data.vehicleType}</div>
              </div>

              <p>Log in to your dashboard to accept this quote or compare with other quotes.</p>

              <a href="${data.claimLink || `${getAppBaseUrl(data.appBaseUrl)}/trips/${data.requestId}${data.accessToken ? `?token=${encodeURIComponent(data.accessToken)}` : ''}`}" class="button">View &amp; Accept Quote</a>

              <div class="footer">
                <p>&copy; 2026 Businto. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  }),

  operatorOrderDetails: (data: {
    operatorName: string;
    parentName: string;
    parentEmail: string;
    parentPhone: string;
    quoteAmount: number;
    pickup: string;
    dropoff: string;
    date: string;
    time?: string;
    vehicleType: string;
    confirmationCode: string;
    bookingId: string;
    appBaseUrl?: string;
  }) => ({
    subject: `Order Details - Booking ${data.confirmationCode} Confirmed`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px; }
            .contact-card { background: #ecfdf5; border: 2px solid #10b981; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .contact-info { margin: 10px 0; border-bottom: 1px solid rgba(16, 185, 129, 0.1); padding-bottom: 8px; }
            .contact-info:last-child { border-bottom: 0; }
            .label { font-weight: 800; color: #065f46; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
            .value { color: #047857; margin-top: 4px; font-weight: 600; font-size: 16px; }
            .trip-details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin: 12px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
            .detail-row:last-child { border-bottom: 0; }
            .detail-label { color: #6b7280; font-size: 13px; }
            .detail-value { font-weight: 600; color: #111827; text-align: right; }
            .next-steps { background: #fffbeb; border: 1px solid #fcd34d; padding: 15px; border-radius: 8px; margin: 20px 0; color: #92400e; font-size: 14px; }
            .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Job Confirmed!</h1>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">Booking #${data.confirmationCode}</p>
            </div>
            <div class="content">
              <p>Hi <strong>${data.operatorName}</strong>,</p>
              <p>The customer has accepted your quote. You are now officially booked for this trip.</p>

              <div class="contact-card">
                <h2 style="margin-top: 0; color: #065f46; font-size: 18px;">📞 Customer Contact Information</h2>
                <div class="contact-info">
                  <div class="label">Primary Contact</div>
                  <div class="value">${data.parentName}</div>
                </div>
                <div class="contact-info">
                  <div class="label">Email Address</div>
                  <div class="value"><a href="mailto:${data.parentEmail}" style="color: #047857; text-decoration: none;">${data.parentEmail}</a></div>
                </div>
                <div class="contact-info">
                  <div class="label">Phone Number</div>
                  <div class="value"><a href="tel:${data.parentPhone}" style="color: #047857; text-decoration: none;">${data.parentPhone}</a></div>
                </div>
              </div>

              <div class="trip-details">
                <h3 style="margin-top: 0; font-size: 16px;">Trip Logistics</h3>
                <div class="detail-row">
                  <span class="detail-label">Pickup Address</span>
                  <span class="detail-value">${data.pickup}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Drop-off Address</span>
                  <span class="detail-value">${data.dropoff}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date & Time</span>
                  <span class="detail-value">${data.date}${data.time ? ` at ${data.time}` : ''}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Vehicle Booked</span>
                  <span class="detail-value">${data.vehicleType}</span>
                </div>
                <div class="detail-row" style="border-top: 2px solid #e5e7eb; padding-top: 12px; margin-top: 15px;">
                  <span class="detail-label" style="font-weight: bold; color: #111827;">Payout Amount</span>
                  <span class="detail-value" style="font-size: 20px; font-weight: 800; color: #059669;">${data.quoteAmount === 0 ? 'TBD' : `$${data.quoteAmount.toFixed(2)}`}</span>
                </div>
              </div>

              <div class="next-steps">
                <strong>💡 Next Steps:</strong><br>
                Please contact the customer directly using the information above to finalize any remaining logistical details.
              </div>

              <div style="text-align: center; margin-top: 20px;">
                <a href="${getAppBaseUrl(data.appBaseUrl)}/dashboard/bookings" class="button" style="background: #10b981;">Manage in Dashboard</a>
              </div>

              <div class="footer">
                <p>&copy; 2026 Businto Logistics. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  }),

  bookingConfirmation: (data: {
    userName: string;
    confirmationCode: string;
    operatorName: string;
    operatorPhone?: string;
    operatorEmail?: string;
    vehicleType: string;
    pickupAddress: string;
    dropoffAddress: string;
    date: string;
    time?: string;
    amount: number;
    appBaseUrl?: string;
  }) => ({
    subject: `Booking Confirmed: ${data.confirmationCode}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .confirmation-code { background: rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 8px; display: inline-block; margin-top: 15px; font-size: 24px; font-family: monospace; letter-spacing: 2px; }
            .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px; }
            .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
            .detail-row:last-child { border-bottom: 0; }
            .label { color: #6b7280; font-size: 14px; }
            .value { font-weight: 600; color: #111827; }
            .total { background: #4f46e5; color: white; padding: 15px; border-radius: 8px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; }
            .contact-card { background: #e0e7ff; border: 1px solid #c7d2fe; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Booking Confirmed!</h1>
              <div class="confirmation-code">${data.confirmationCode}</div>
            </div>
            <div class="content">
              <p>Hi ${data.userName},</p>
              <p>Your booking has been confirmed! Here are your trip details:</p>

              <div class="details">
                <div class="detail-row">
                  <span class="label">Operator</span>
                  <span class="value">${data.operatorName}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Vehicle</span>
                  <span class="value">${data.vehicleType}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Date</span>
                  <span class="value">${data.date}${data.time ? ` at ${data.time}` : ''}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Pickup</span>
                  <span class="value">${data.pickupAddress}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Destination</span>
                  <span class="value">${data.dropoffAddress}</span>
                </div>
              </div>

              <div class="total">$${data.amount.toFixed(2)}</div>

              <div class="contact-card">
                <h3 style="margin-top: 0; color: #3730a3; font-size: 16px;">📞 Operator Contact Details</h3>
                <p style="margin: 5px 0; font-size: 14px;"><strong>${data.operatorName}</strong></p>
                ${data.operatorPhone ? `<p style="margin: 5px 0; font-size: 14px;">Phone: <a href="tel:${data.operatorPhone}" style="color: #4f46e5; text-decoration: none;">${data.operatorPhone}</a></p>` : ''}
                ${data.operatorEmail ? `<p style="margin: 5px 0; font-size: 14px;">Email: <a href="mailto:${data.operatorEmail}" style="color: #4f46e5; text-decoration: none;">${data.operatorEmail}</a></p>` : ''}
              </div>

              <p>The operator will contact you before your trip. You can also message them directly through your dashboard.</p>

              <a href="${getAppBaseUrl(data.appBaseUrl)}/dashboard/bookings" class="button">Manage Booking</a>

              <div class="footer">
                <p>&copy; 2026 Businto. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  }),

  tripCompletedFollowUp: (data: {
    userName: string;
    operatorName: string;
    date: string;
    requestId: string;
    appBaseUrl?: string;
  }) => ({
    subject: `How was your trip with ${data.operatorName}?`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px; }
            .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; margin-right: 10px; }
            .button-outline { display: inline-block; background: white; color: #ef4444; border: 1px solid #ef4444; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Did your trip happen?</h1>
            </div>
            <div class="content">
              <p>Hi ${data.userName},</p>
              <p>We hope your trip on <strong>${data.date}</strong> with <strong>${data.operatorName}</strong> went well!</p>

              <p>Your feedback is critical to keeping the Businto marketplace safe and high-quality. Please let us know if everything went as planned.</p>

              <div style="text-align: center; margin-top: 30px;">
                <a href="${getAppBaseUrl(data.appBaseUrl)}/dashboard/bookings?review=${data.requestId}" class="button">Yes, Rate My Trip</a>
                <a href="${getAppBaseUrl(data.appBaseUrl)}/contact?report=${data.requestId}" class="button-outline">No, I Need Help</a>
              </div>

              <div class="footer">
                <p>&copy; 2026 Businto. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  }),

  paymentSuccess: (data: {
    userName: string;
    confirmationCode: string;
    amount: number;
    routingFee?: number;
    operatorQuote?: number;
  }) => ({
    subject: `Payment Received: $${(data.routingFee || 1.99).toFixed(2)} Platform Routing Fee`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px; }
            .success-icon { font-size: 48px; margin-bottom: 15px; }
            .amount { font-size: 36px; font-weight: bold; color: #16a34a; margin: 20px 0; }
            .notice { background: #fef3c7; border: 1px solid #fbbf24; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .breakdown { background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="success-icon">✓</div>
              <h1>Payment Successful</h1>
            </div>
            <div class="content">
              <p>Hi ${data.userName},</p>
              <p>Your platform routing fee has been processed successfully.</p>

              <div style="text-align: center;">
                <div class="amount">$${(data.routingFee || 1.99).toFixed(2)}</div>
                <p style="color: #6b7280;">Booking: ${data.confirmationCode}</p>
              </div>

              <div class="notice">
                <p style="margin: 0; font-size: 14px;"><strong>⚠️ Important Payment Notice</strong></p>
                <p style="margin: 8px 0 0 0; font-size: 13px;">
                  This payment is the <strong>platform routing fee only</strong>. You will pay the operator <strong>$${(data.operatorQuote || data.amount).toFixed(2)}</strong> directly for your trip.
                </p>
              </div>

              <div class="breakdown">
                <p style="margin: 0 0 10px 0; font-weight: bold;">Payment Breakdown:</p>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span>Platform Routing Fee (paid now)</span>
                  <span style="font-weight: bold; color: #16a34a;">$${(data.routingFee || 1.99).toFixed(2)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid #d1d5db;">
                  <span>Trip Cost (pay operator directly)</span>
                  <span style="font-weight: bold;">$${(data.operatorQuote || data.amount).toFixed(2)}</span>
                </div>
              </div>

              <p>A receipt has been sent to your email. Thank you for using Businto!</p>

              <div class="footer">
                <p>&copy; 2026 Businto. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  }),

  operatorNewRequest: (data: {
    operatorName: string;
    serviceType: string;
    serviceTypeDisplay: string;
    pickupAddress: string;
    dropoffAddress: string;
    pickupFuzzy: string;
    dropoffFuzzy: string;
    date: string;
    time?: string;
    scheduleType?: string;
    studentCount?: string;
    requirements: string[];
    requestId: string;
    /** Preferred: short tracking-resistant claim link */
    claimLink?: string;
    /** Legacy: long JWT access token (still accepted for backward compat) */
    accessToken?: string;
    appBaseUrl?: string;
  }) => {
    // Define colors and icons for each service type
    const serviceConfig = {
      school: {
        gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
        icon: '🚌',
        accentColor: '#f59e0b',
        greeting: 'School Transportation Request'
      },
      medical: {
        gradient: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
        icon: '🏥',
        accentColor: '#0ea5e9',
        greeting: 'Medical Transportation Request'
      },
      wedding: {
        gradient: 'linear-gradient(135deg, #a855f7, #9333ea)',
        icon: '💐',
        accentColor: '#a855f7',
        greeting: 'Event Shuttle Request'
      }
    };

    const config = serviceConfig[data.serviceType as keyof typeof serviceConfig] || serviceConfig.school;
    const appBaseUrl = getAppBaseUrl(data.appBaseUrl);

    // Resolve the effective link: prefer claimLink (short code), fall back to legacy token URL
    const effectiveClaimLink: string = data.claimLink
      || (data.accessToken
        ? `${appBaseUrl}/quotes/submit?request_id=${data.requestId}&token=${data.accessToken}`
        : '');

    console.log(`[Email/Template] Generating operatorNewRequest for ${data.operatorName}. effectiveLink: ${effectiveClaimLink}`);

    if (!effectiveClaimLink) {
      throw new Error('operatorNewRequest requires either claimLink or accessToken');
    }

    // CRITICAL: Validate claim link before inserting into HTML (only for new-style claim links)
    if (data.claimLink) {
      if (!data.claimLink.includes('/claim/')) {
        console.error(`🔴 INVALID CLAIM LINK FORMAT: ${data.claimLink}`);
        throw new Error(`Invalid claim link format: ${data.claimLink}. Expected format: https://businto.com/claim/CODE`);
      }

      if (data.claimLink.includes('.r.af.d.sendibt') || data.claimLink.includes('/tr/cl/')) {
        console.error(`🔴 BREVO TRACKING WRAPPER DETECTED: ${data.claimLink}`);
        throw new Error(`Claim link appears to be wrapped by Brevo: ${data.claimLink}`);
      }

      if (data.claimLink.length > 500) {
        console.warn(`⚠️  Claim link is unusually long (${data.claimLink.length} chars), may indicate corruption`);
      }
    }

    // Shorten fuzzy address for subject line to avoid rejection by mail servers
    const shortLocation = data.pickupFuzzy.split(',')[0];

    return {
      subject: `${data.serviceTypeDisplay} inquiry - ${shortLocation}`,
      html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { border-bottom: 4px solid ${config.accentColor}; padding-bottom: 20px; margin-bottom: 30px; text-align: center; }
            .content { background: #fff; }
            .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
            .detail-row:last-child { border-bottom: 0; }
            .label { color: #6b7280; font-size: 14px; }
            .value { font-weight: 600; color: #111827; text-align: right; }
            .requirements { list-style: none; padding: 0; margin: 10px 0 0 0; }
            .requirements li { padding: 6px 0; color: #374151; }
            .requirements li:before { content: "• "; color: ${config.accentColor}; font-weight: bold; margin-right: 8px; }
            .button { display: inline-block; background-color: ${config.accentColor}; color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px; }
            .disclaimer { background: #f3f4f6; padding: 20px; border-radius: 8px; margin-top: 25px; font-size: 13px; color: #6b7280; line-height: 1.8; }
            .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: #111827; margin: 0;">${config.greeting}</h1>
              <p style="margin: 10px 0 0 0; font-size: 14px; color: #6b7280;">Request ID: ${data.requestId.slice(0, 8)}</p>
            </div>

            <div class="content">
              <p>Hello <strong>${data.operatorName}</strong>,</p>
              
              <p>A customer has submitted the following ${data.serviceType} transportation request in your service area:</p>

              <div class="details">
                <div class="detail-row">
                  <span class="label">Service Type</span>
                  <span class="value">${data.serviceTypeDisplay}</span>
                </div>
                ${data.dropoffFuzzy ? `
                <div class="detail-row">
                  <span class="label">Pickup Area</span>
                  <span class="value">${maskStreetNumber(data.pickupAddress)}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Dropoff Area</span>
                  <span class="value">${maskStreetNumber(data.dropoffAddress)}</span>
                </div>
                ` : `
                <div class="detail-row">
                  <span class="label">General Area</span>
                  <span class="value">${maskStreetNumber(data.pickupAddress)}</span>
                </div>
                `}
                ${data.scheduleType ? `
                <div class="detail-row">
                  <span class="label">Schedule Type</span>
                  <span class="value">${data.scheduleType}</span>
                </div>
                ` : ''}
                <div class="detail-row">
                  <span class="label">${data.time ? 'Date & Time' : 'Start Date'}</span>
                  <span class="value">${data.date}${data.time ? ` at ${data.time}` : ''}</span>
                </div>
                ${data.studentCount ? `
                <div class="detail-row">
                  <span class="label">Students</span>
                  <span class="value">${data.studentCount}</span>
                </div>
                ` : ''}
                ${data.requirements.length > 0 ? `
                <div class="detail-row" style="display: block;">
                  <div class="label" style="margin-bottom: 8px;">Additional Requirements</div>
                  <ul class="requirements">
                    ${data.requirements.map(req => `<li>${req}</li>`).join('')}
                  </ul>
                </div>
                ` : ''}
              </div>

              <p><strong>Next Steps:</strong></p>
              <p>If you would like to provide pricing or availability, use the link below to submit an indicative quote:</p>

              <!--
                IMPORTANT: The button href may be wrapped by Brevo's click tracker (sendibt2.com).
              -->
              <div style="text-align: center;">
                <a href="${effectiveClaimLink}" class="button" style="display:inline-block;background-color:${config.accentColor};color:#ffffff!important;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:20px;">
                  Claim Job
                </a>
              </div>

              <p style="font-size: 14px; color: #6b7280;">
                Once the customer accepts your quote, you will receive their full contact details and exact pickup address to finalize arrangements directly.
              </p>

              <div class="disclaimer">
                <p style="margin: 0 0 10px 0;"><strong>Note:</strong></p>
                <p style="margin: 0;">Businto is a request-routing service. All transportation services are provided directly between operators and customers.</p>
              </div>

              <div class="footer">
                <p>&copy; 2026 Businto. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
    };
  },

  requestExpired: (data: {
    userName: string;
    serviceTypeDisplay: string;
    appBaseUrl?: string;
  }) => ({
    subject: `Your ${data.serviceTypeDisplay} request has expired`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6b7280, #9ca3af); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px; }
            .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 24px;">Request Expired</h1>
              <p style="margin: 8px 0 0; opacity: 0.9;">Your ${data.serviceTypeDisplay} request was not fulfilled</p>
            </div>
            <div class="content">
              <p>Hi ${data.userName},</p>
              <p>Your <strong>${data.serviceTypeDisplay}</strong> request has expired without a confirmed booking. This can happen if no operator was available, or if the trip date has already passed.</p>
              <p>If you still need transportation, you're welcome to submit a new request and we'll do our best to find you a match.</p>
              <div style="text-align: center;">
                <a href="${getAppBaseUrl(data.appBaseUrl)}/request" class="button">Submit a New Request</a>
              </div>
              <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">If you have questions or need assistance, please contact us and we'll be happy to help.</p>
              <div class="footer">
                <p>&copy; 2026 Businto. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Hi ${data.userName}, your ${data.serviceTypeDisplay} request has expired without a confirmed booking. If you still need transportation, submit a new request at ${getAppBaseUrl(data.appBaseUrl)}/request`,
  }),

  adminDispatchedNotification: (data: {
    userName: string;
    serviceTypeDisplay: string;
    requestId: string;
    appBaseUrl?: string;
  }) => ({
    subject: `We're working on your ${data.serviceTypeDisplay} request`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #0f766e, #14b8a6); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px; }
            .status-badge { display: inline-block; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 14px; margin: 16px 0; }
            .button { display: inline-block; background: #0f766e; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 24px;">We found an operator</h1>
              <p style="margin: 8px 0 0; opacity: 0.9;">Your ${data.serviceTypeDisplay} request is being handled</p>
            </div>
            <div class="content">
              <p>Hi ${data.userName},</p>
              <p>Great news — we've matched your <strong>${data.serviceTypeDisplay}</strong> request with a vetted operator and sent them your job details.</p>

              <div style="text-align: center;">
                <span class="status-badge">Operator Notified</span>
              </div>

              <p>The operator will review your request and submit a quote shortly. You'll receive an email the moment a quote is ready for you to review.</p>

              <p style="color: #6b7280; font-size: 14px;">In the meantime, you can check the status of your request from your dashboard.</p>

              <div style="text-align: center;">
                <a href="${getAppBaseUrl(data.appBaseUrl)}/trips/${data.requestId}" class="button">View My Request</a>
              </div>

              <div class="footer">
                <p>&copy; 2026 Businto. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Hi ${data.userName}, we found an operator for your ${data.serviceTypeDisplay} request and sent them your job details. They'll submit a quote shortly. View your request: ${getAppBaseUrl(data.appBaseUrl)}/trips/${data.requestId}`,
  }),
};
