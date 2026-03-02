/**
 * Email Logger - Comprehensive error and validation logging for email operations
 *
 * This module tracks:
 * - Email sending events with detailed metadata
 * - Link validation and corruption detection
 * - Brevo SMTP integration issues
 * - Claim code generation and usage
 * - Email delivery tracking
 */

import { logEvent } from './event-logger';

export interface EmailSendLog {
  messageId?: string;
  to: string;
  subject: string;
  linkCount: number;
  claimLinkFound: boolean;
  timestamp: string;
  transportType: 'brevo' | 'ethereal' | 'test';
  trackingDisabled?: boolean;
  previewUrl?: string;
  status: 'pending' | 'sent' | 'failed';
  error?: string;
  brevoHeaders?: Record<string, string>;
}

export interface LinkValidationResult {
  valid: boolean;
  issues: string[];
  links: {
    original: string;
    isValid: boolean;
    type: 'claim' | 'internal' | 'external';
    isCorrupted: boolean;
  }[];
}

/**
 * Validates email links to catch Brevo tracking wrapper issues
 */
export function validateEmailLinks(html: string): LinkValidationResult {
  const issues: string[] = [];
  const linkRegex = /href="([^"]+)"/g;
  const links: LinkValidationResult['links'] = [];

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];

    // Detect corrupted Brevo tracking links
    const isBrevoCorrupted =
      url.includes('.r.af.d.sendibt') ||
      url.includes('.r.sendibt') ||
      url.includes('brevo') && url.includes('/tr/cl/');

    // Detect claim links
    const isClaimLink = url.includes('/claim/');

    // Detect obvious corruption patterns
    const corruptionPatterns = [
      /[a-z0-9]{100,}/, // Extremely long alphanumeric sequences
      /[A-Z]{20,}[a-z0-9]{50,}/, // Excessive uppercase followed by long sequences
      /[_-]{5,}/, // Multiple consecutive separators
    ];

    const isCorrupted = corruptionPatterns.some(pattern => pattern.test(url));

    const linkType = isClaimLink ? 'claim' : url.startsWith('http') ? 'external' : 'internal';

    links.push({
      original: url,
      isValid: !isCorrupted && url.length < 2048,
      type: linkType,
      isCorrupted: isCorrupted || isBrevoCorrupted,
    });

    if (isCorrupted || isBrevoCorrupted) {
      issues.push(`Corrupted link detected: ${url.substring(0, 100)}...`);
    }

    if (url.length > 2048) {
      issues.push(`URL exceeds safe length (${url.length} chars): ${url.substring(0, 50)}...`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    links,
  };
}

/**
 * Logs email sending details to both console and event system
 */
export async function logEmailSend(log: EmailSendLog): Promise<void> {
  const timestamp = new Date(log.timestamp);

  console.log(`
┌─ EMAIL LOG ─────────────────────────────────────────────────────
│ To: ${log.to}
│ Subject: ${log.subject}
│ Status: ${log.status}
│ Links Found: ${log.linkCount}
│ Claim Link: ${log.claimLinkFound ? '✅ Yes' : '❌ No'}
│ Tracking: ${log.trackingDisabled ? '🚫 Disabled' : '✅ Enabled'}
│ Transport: ${log.transportType}
│ Message ID: ${log.messageId || 'N/A'}
${log.error ? `│ ERROR: ${log.error}` : ''}
${log.brevoHeaders ? `│ Brevo Headers: ${JSON.stringify(log.brevoHeaders)}` : ''}
${log.previewUrl ? `│ Preview: ${log.previewUrl}` : ''}
└─────────────────────────────────────────────────────────────────
  `);

  // Log to event system for audit trail
  if (log.status === 'failed' || log.error) {
    await logEvent({
      event_type: 'email.send_failed',
      status: 'error',
      metadata: {
        to: log.to,
        subject: log.subject,
        error: log.error,
        link_count: log.linkCount,
        claim_link_found: log.claimLinkFound,
        transport_type: log.transportType,
        message_id: log.messageId,
      },
    });
  } else if (log.status === 'sent') {
    await logEvent({
      event_type: 'email.send_success',
      status: 'success',
      metadata: {
        to: log.to,
        subject: log.subject,
        link_count: log.linkCount,
        claim_link_found: log.claimLinkFound,
        tracking_disabled: log.trackingDisabled,
        transport_type: log.transportType,
        message_id: log.messageId,
      },
    });
  }
}

/**
 * Logs link validation results
 */
export async function logLinkValidation(
  emailTo: string,
  validationResult: LinkValidationResult,
  requestId?: string
): Promise<void> {
  const corruptedLinks = validationResult.links.filter(l => l.isCorrupted);

  if (corruptedLinks.length > 0) {
    console.error(`
🔴 LINK CORRUPTION DETECTED
To: ${emailTo}
${requestId ? `Request: ${requestId}` : ''}
Corrupted Links: ${corruptedLinks.length}
${corruptedLinks.map(l => `  - ${l.original.substring(0, 80)}...`).join('\n')}
`);

    await logEvent({
      event_type: 'email.link_corruption_detected',
      status: 'error',
      metadata: {
        to: emailTo,
        corrupted_link_count: corruptedLinks.length,
        total_link_count: validationResult.links.length,
        corrupted_links: corruptedLinks.map(l => l.original.substring(0, 100)),
        issues: validationResult.issues,
        request_id: requestId,
      },
    });
  } else if (validationResult.issues.length > 0) {
    console.warn(`
⚠️ LINK VALIDATION ISSUES
To: ${emailTo}
${requestId ? `Request: ${requestId}` : ''}
Issues: ${validationResult.issues.join(' | ')}
`);
  }
}

/**
 * Logs claim link generation events
 */
export async function logClaimLinkGeneration(
  requestId: string,
  operatorEmail: string,
  claimLink: string,
  operatorId?: string
): Promise<void> {
  console.log(`
✅ CLAIM LINK GENERATED
Request: ${requestId}
Operator Email: ${operatorEmail}
Operator ID: ${operatorId || 'N/A'}
Link Length: ${claimLink.length} chars
Link: ${claimLink}
`);

  await logEvent({
    event_type: 'claim_link.generated',
    status: 'success',
    actor_id: operatorId,
    metadata: {
      request_id: requestId,
      operator_email: operatorEmail,
      link_length: claimLink.length,
      link: claimLink,
    },
  });
}

/**
 * Logs Brevo SMTP specific issues
 */
export async function logBrevoError(
  error: any,
  context: {
    to: string;
    subject: string;
    requestId?: string;
    operatorId?: string;
  }
): Promise<void> {
  const errorMessage = error?.message || String(error);
  const errorCode = error?.code || error?.response?.status || 'UNKNOWN';
  const fullResponse = error?.response;

  console.error(`
🔴 BREVO SMTP ERROR
To: ${context.to}
Subject: ${context.subject}
Error Code: ${errorCode}
Error: ${errorMessage}
${context.requestId ? `Request: ${context.requestId}` : ''}
${context.operatorId ? `Operator: ${context.operatorId}` : ''}
${fullResponse ? `Full Response: ${JSON.stringify(fullResponse).substring(0, 300)}` : ''}
`);

  await logEvent({
    event_type: 'brevo.smtp_error',
    status: 'error',
    actor_id: context.operatorId,
    metadata: {
      to: context.to,
      subject: context.subject,
      error_code: errorCode,
      error_message: errorMessage,
      request_id: context.requestId,
      operator_id: context.operatorId,
      full_response: fullResponse ? JSON.stringify(fullResponse).substring(0, 500) : null,
    },
  });
}

/**
 * Logs email template rendering for debugging
 */
export async function logEmailTemplate(
  templateName: string,
  data: Record<string, any>,
  issues: string[] = []
): Promise<void> {
  if (issues.length > 0) {
    console.warn(`
⚠️ EMAIL TEMPLATE ISSUES
Template: ${templateName}
Issues:
${issues.map(i => `  - ${i}`).join('\n')}
Data Keys: ${Object.keys(data).join(', ')}
`);
  } else {
    console.log(`
✅ EMAIL TEMPLATE RENDERED
Template: ${templateName}
Data Keys: ${Object.keys(data).join(', ')}
`);
  }
}

/**
 * Detailed Brevo header inspection
 */
export function inspectBrevoHeaders(headers: Record<string, string>): {
  trackingStatus: string;
  hasDisableTrackingHeader: boolean;
  headers: Record<string, string>;
} {
  const trackingHeader = headers['X-Mailin-Track-Click'];
  const hasDisableTrackingHeader = trackingHeader !== undefined;

  return {
    trackingStatus: trackingHeader === '0' ? 'DISABLED' : trackingHeader === '1' ? 'ENABLED' : 'DEFAULT',
    hasDisableTrackingHeader,
    headers: {
      'X-Mailin-Track-Click': trackingHeader || 'not-set',
      'X-Mailin-Tag': headers['X-Mailin-Tag'] || 'not-set',
      ...Object.keys(headers)
        .filter(k => k.startsWith('X-'))
        .reduce((acc, k) => ({ ...acc, [k]: headers[k] }), {}),
    },
  };
}
