import nodemailer from 'nodemailer';
import { maskStreetNumber } from './location-utils';
import {
  validateEmailLinks,
  logEmailSend,
  logLinkValidation,
  logBrevoError,
  inspectBrevoHeaders,
  type EmailSendLog,
} from './email-logger';

// Ethereal fallback for local testing when SMTP credentials are not configured
let transporter: nodemailer.Transporter | null = null;
let testAccount: { user: string; pass: string; smtp: { host: string; port: number; secure: boolean } } | null = null;

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : undefined;
}

async function getTransporter() {
  if (transporter) return transporter;

  const brevoKey = env('BREVO_SMTP_KEY') || env('BREVO_API_KEY');
  const smtpHost = env('SMTP_HOST') || (brevoKey ? 'smtp-relay.brevo.com' : undefined);
  const smtpPort = Number(env('SMTP_PORT') || (brevoKey ? '587' : '0'));
  const smtpUser = env('SMTP_USER') || env('BREVO_SMTP_LOGIN');
  const smtpPass = env('SMTP_PASS') || brevoKey;
  const smtpSecure = env('SMTP_SECURE') === 'true';

  // If any SMTP fields are present, require complete configuration
  const hasAnySmtpConfig = Boolean(smtpHost || smtpUser || smtpPass);
  const hasCompleteSmtpConfig = Boolean(smtpHost && smtpPort && smtpUser && smtpPass);

  if (hasAnySmtpConfig && !hasCompleteSmtpConfig) {
    throw new Error('Incomplete SMTP config: set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS (or BREVO_SMTP_KEY + BREVO_SMTP_LOGIN).');
  }

  if (hasCompleteSmtpConfig) {
    transporter = nodemailer.createTransport({
      host: smtpHost!,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser!,
        pass: smtpPass!,
      },
    });
    console.log(`📧 SMTP configured: ${smtpHost}:${smtpPort} (${smtpUser})`);
    return transporter;
  }

  // Fallback to Ethereal when no SMTP settings are configured
  if (!testAccount) {
    testAccount = await nodemailer.createTestAccount();
    console.log('📧 Ethereal Email Account Created:');
    console.log('   Email:', testAccount.user);
    console.log('   Password:', testAccount.pass);
  }

  transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  return transporter;
}

const FROM_EMAIL = env('SMTP_FROM_EMAIL') || 'Businto <noreply@businto.com>';

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

export async function sendEmail({ to, subject, html, headers, trackingClicks, forceApi, forceSmtp }: EmailOptions & { forceApi?: boolean; forceSmtp?: boolean }) {
  const apiKey = env('BREVO_API_KEY') || env('BREVO_SMTP_KEY');
  
  // Validate links before sending to catch corruption early
  const linkValidation = validateEmailLinks(html);
  const linkMatches = html.match(/href="([^"]+)"/g) || [];
  const claimLinkFound = linkMatches.some(link => link.includes('/claim/'));

  // Log validation issues
  if (!linkValidation.valid) {
    await logLinkValidation(to, linkValidation);
  }

  // CRITICAL: forceSmtp is required for operator emails to ensure X-Mailin-Track-Click header is respected
  // SMTP relay respects this header; REST API likely does not.
  if (forceSmtp) {
    const smtpHost = env('SMTP_HOST');
    const smtpUser = env('SMTP_USER');
    const smtpPass = env('SMTP_PASS') || env('BREVO_SMTP_KEY');
    
    if (!smtpHost || !smtpUser || !smtpPass) {
      throw new Error(
        'Cannot send operator email: forceSmtp=true but SMTP credentials not configured. ' +
        'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (or BREVO_SMTP_KEY) in environment.'
      );
    }
    
    // Ensure tracking is disabled for operator emails via SMTP
    const finalHeaders = {
      ...headers,
      'X-Mailin-Track-Click': '0',
      'X-Mailin-Tag': headers?.['X-Mailin-Tag'] || 'operator-request',
    };
    
    console.log(`[Email] Sending operator email via SMTP (forceSmtp=true, tracking disabled)`);
    return sendEmailViaSMTP({ to, subject, html, headers: finalHeaders, trackingClicks: false });
  }

  return sendEmailViaSMTP({ to, subject, html, headers, trackingClicks });
}

/**
 * Internal helper to send via SMTP relay.
 * Separated from sendEmail to allow forceSmtp routing with SMTP-only enforcement.
 */
async function sendEmailViaSMTP({ to, subject, html, headers, trackingClicks }: EmailOptions) {
  // For telemetry inside the SMTP path, we need linkMatches again
  const linkMatches = html.match(/href="([^"]+)"/g) || [];
  const claimLinkFound = linkMatches.some(link => link.includes('/claim/'));

  try {
    const transport = await getTransporter();
    const transportOptions = transport.options as Record<string, unknown>;
    const transportType = (typeof transportOptions?.host === 'string' && transportOptions.host.includes('ethereal')) ? 'ethereal' : 'brevo';

    // Prepare headers with tracking control
    const finalHeaders = {
      ...headers,
      // Default identification header for Sendinblue/Brevo
      'X-Mailin-Tag': headers?.['X-Mailin-Tag'] || 'transactional-email',
      // Optional: Disable click tracking per email if explicitly requested (0 to disable, 1 to enable)
      ...(trackingClicks !== undefined ? { 'X-Mailin-Track-Click': trackingClicks ? '1' : '0' } : {}),
    };

    const headerInspection = inspectBrevoHeaders(finalHeaders);

    console.log(`
📧 EMAIL SEND ATTEMPT
To: ${to}
Subject: ${subject}
Transport: ${transportType}
Links: ${linkMatches.length} found, Claim link: ${claimLinkFound}
Tracking: ${headerInspection.trackingStatus}
`);

    const info = await transport.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      headers: finalHeaders,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;

    // Log successful send
    await logEmailSend({
      messageId: info.messageId,
      to,
      subject,
      linkCount: linkMatches.length,
      claimLinkFound,
      timestamp: new Date().toISOString(),
      transportType: transportType as 'brevo' | 'ethereal' | 'test',
      trackingDisabled: trackingClicks === false,
      previewUrl,
      status: 'sent',
      brevoHeaders: finalHeaders,
    });

    console.log('\n==============================================');
    console.log(`✅ EMAIL SENT SUCCESSFULLY TO: ${to}`);
    if (previewUrl) {
      console.log('📧 CLICK THIS URL TO VIEW EMAIL:');
      console.log(previewUrl);
    } else {
      console.log(`🆔 Message ID: ${info.messageId}`);
    }
    console.log('==============================================\n');

    if (previewUrl) {
      // Also write preview URLs to file for easy access in test mode
      const fs = require('fs');
      const path = require('path');
      const logFile = path.join(process.cwd(), 'email-preview-urls.txt');
      fs.appendFileSync(logFile, `${new Date().toISOString()} - ${to}\n${previewUrl}\n\n`);
      console.log(`📝 URL also saved to: email-preview-urls.txt`);
    }

    return {
      id: info.messageId,
      previewUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Log error
    await logEmailSend({
      to,
      subject,
      linkCount: linkMatches.length,
      claimLinkFound,
      timestamp: new Date().toISOString(),
      transportType: 'brevo',
      trackingDisabled: trackingClicks === false,
      status: 'failed',
      error: errorMessage,
    });

    console.error('Failed to send email via SMTP:', error);
    // If SMTP fails, try API as a backup if we have a key
    const apiKey = env('BREVO_API_KEY') || env('BREVO_SMTP_KEY');
    if (apiKey) {
      console.log('🔄 Attempting API fallback after SMTP failure...');
      return sendEmailViaApi({ to, subject, html, headers, trackingClicks });
    }
    throw error;
  }
}

/**
 * Sends a transactional email via Brevo REST API.
 * This is more reliable for link integrity and provides better tracking control.
 */
export async function sendEmailViaApi({ to, subject, html, headers, trackingClicks }: EmailOptions) {
  const apiKey = env('BREVO_API_KEY') || env('BREVO_SMTP_KEY');
  
  if (!apiKey) {
    throw new Error('BREVO_API_KEY or BREVO_SMTP_KEY is required for API-based email.');
  }

  // Validate links before sending
  const linkValidation = validateEmailLinks(html);
  const linkMatches = html.match(/href="([^"]+)"/g) || [];
  const claimLinkFound = linkMatches.some(link => link.includes('/claim/'));

  if (!linkValidation.valid) {
    await logLinkValidation(to, linkValidation);
  }

  // Parse sender info
  const fromMatch = FROM_EMAIL.match(/^(.*)\s+<(.*)>$/) || [null, 'Businto', 'noreply@businto.com'];
  const senderName = fromMatch[1];
  const senderEmail = fromMatch[2];

  try {
    const apiHeaders: Record<string, string> = {
      ...headers,
      'X-Mailin-Tag': headers?.['X-Mailin-Tag'] || 'transactional-email',
    };

    // Add tracking control header for API
    if (trackingClicks !== undefined) {
      apiHeaders['X-Mailin-Track-Click'] = trackingClicks ? '1' : '0';
    }

    console.log(`[Email/API] Sending to ${to}: "${subject}" (tracking: ${trackingClicks ?? 'default'}, links: ${linkMatches.length})`);
    
    const body = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html,
      headers: apiHeaders,
    };

    // Note: Brevo API v3 tracking parameters are slightly different
    // By default click tracking is managed in the Brevo dashboard settings
    // But can be overridden in the API call if needed.
    
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    // Log Brevo response details for debugging
    console.log(`[Email/API] Brevo response status: ${response.status}`);
    console.log(`[Email/API] Brevo response headers:`, {
      'content-type': response.headers.get('content-type'),
      'x-sib-id': response.headers.get('x-sib-id'),
    });
    console.log(`[Email/API] Brevo response body:`, JSON.stringify(data, null, 2).substring(0, 500));

    if (!response.ok) {
      console.error('❌ Brevo API Email Error:', data);
      
      await logBrevoError(
        { message: data.message || 'API request failed', code: data.code || response.status, response: data },
        { to, subject }
      );
      
      throw new Error(data.message || 'Failed to send email via API');
    }

    // Log successful send with response metadata
    await logEmailSend({
      messageId: data.messageId,
      to,
      subject,
      linkCount: linkMatches.length,
      claimLinkFound,
      timestamp: new Date().toISOString(),
      transportType: 'brevo',
      trackingDisabled: trackingClicks === false,
      status: 'sent',
      brevoHeaders: {
        ...apiHeaders,
        'message-id': data.messageId,
      },
    });

    console.log(`✅ Email sent successfully via API to ${to} (ID: ${data.messageId})`);
    
    return {
      id: data.messageId,
      previewUrl: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Log error
    await logEmailSend({
      to,
      subject,
      linkCount: linkMatches.length,
      claimLinkFound,
      timestamp: new Date().toISOString(),
      transportType: 'brevo',
      trackingDisabled: trackingClicks === false,
      status: 'failed',
      error: errorMessage,
    });

    console.error('💥 Email API failure:', error);
    throw error;
  }
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

              <a href="${data.claimLink || (data.appBaseUrl?.startsWith('http') && (data.appBaseUrl.includes('?token=') || data.appBaseUrl.includes('&token=')))
        ? data.appBaseUrl
        : data.appBaseUrl?.startsWith('http') && !data.appBaseUrl.includes('/trips/')
          ? `${data.appBaseUrl}/trips/${data.requestId}${data.accessToken ? `?token=${encodeURIComponent(data.accessToken)}` : ''}`
          : data.appBaseUrl?.startsWith('http')
            ? data.appBaseUrl
            : `${getAppBaseUrl(data.appBaseUrl)}/trips/${data.requestId}${data.accessToken ? `?token=${encodeURIComponent(data.accessToken)}` : ''}`
      }" class="button">View Live Status</a>

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

              <a href="${data.claimLink || (data.appBaseUrl?.startsWith('http') && (data.appBaseUrl.includes('?token=') || data.appBaseUrl.includes('&token=')))
        ? data.appBaseUrl
        : data.appBaseUrl?.startsWith('http') && !data.appBaseUrl.includes('/trips/')
          ? `${data.appBaseUrl}/trips/${data.requestId}${data.accessToken ? `?token=${encodeURIComponent(data.accessToken)}` : ''}`
          : data.appBaseUrl?.startsWith('http')
            ? data.appBaseUrl
            : `${getAppBaseUrl(data.appBaseUrl)}/trips/${data.requestId}${data.accessToken ? `?token=${encodeURIComponent(data.accessToken)}` : ''}`
      }" class="button">View &amp; Accept Quote</a>

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
                The plain-text URL below is always the unmodified original link.
                Operators can copy-paste it if the button redirect fails.
              -->
              <div style="text-align: center;">
                <a href="${effectiveClaimLink}" class="button" style="display:inline-block;background-color:${config.accentColor};color:#ffffff!important;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:20px;">
                  Claim Job
                </a>
              </div>

              <div style="margin-top:16px;padding:14px 18px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;text-align:center;">
                <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;">If the button above doesn't work, <a href="${effectiveClaimLink}" style="color:#0369a1;text-decoration:underline;font-weight:600;">click here</a> or copy and paste this link into your browser:</p>
                <a href="${effectiveClaimLink}" style="display:inline-block;margin:0;font-size:13px;font-weight:600;color:#0369a1;word-break:break-all;font-family:monospace;text-decoration:none;">${effectiveClaimLink}</a>
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
  }
};
