/**
 * Simple SMS utility for Businto using Brevo Transactional SMS API.
 */
import { checkRateLimit } from './rate-limit';

// Helper to get env vars safely
function getEnv(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : undefined;
}

/**
 * Phone number formatter for Brevo SMS API.
 * Brevo expects digits only with country code — no '+' prefix.
 * If no country code is provided, defaults to US (1).
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters (including any leading '+')
  const cleaned = phone.replace(/\D/g, '');

  if (!cleaned) return phone;

  // If it's 10 digits, assume US and prepend country code 1
  if (cleaned.length === 10) {
    return `1${cleaned}`;
  }

  // Already has country code (11+ digits) — return as-is (digits only)
  return cleaned;
}

interface SMSOptions {
  to: string;
  content: string;
  tag?: string;
}

/**
 * Sends a transactional SMS via Brevo.
 * Falls back to local logging if API key is missing.
 */
export async function sendSMS({ to, content, tag }: SMSOptions) {
  const apiKey = getEnv('BREVO_API_KEY') || getEnv('BREVO_SMTP_KEY');
  const senderId = getEnv('SMS_SENDER_ID') || 'Businto';
  const recipient = formatPhoneNumber(to);

  // H4: Per-recipient rate limit — max 5 SMS per phone per hour.
  // Prevents cost overruns and spam once Brevo SMS credits are active.
  if (!checkRateLimit(`sms:${recipient}`, 5)) {
    console.warn(`[SMS] Rate limited: too many SMS to ${recipient}`);
    return { success: false, error: 'rate_limited' };
  }

  // Fallback for local testing or missing config
  if (!apiKey || apiKey === 'your-brevo-api-key') {
    console.log('\n📱 ==========================================');
    console.log('📱 [LOCAL SMS FALLBACK] (No API Key)');
    console.log(`📱 TO: ${recipient}`);
    console.log(`📱 SENDER: ${senderId}`);
    console.log(`📱 CONTENT: ${content}`);
    console.log('📱 ==========================================\n');
    
    // Save to a local file for easy developer access
    try {
      const fs = require('fs');
      const path = require('path');
      const logFile = path.join(process.cwd(), 'sms-preview-log.txt');
      const logEntry = `${new Date().toISOString()} | TO: ${recipient} | CONTENT: ${content}\n`;
      fs.appendFileSync(logFile, logEntry);
    } catch (e) {
      // Ignore file write errors in environments where fs is unavailable
    }
    
    return { success: true, messageId: 'local-test-id' };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: senderId,
        recipient: recipient,
        content: content,
        type: 'transactional',
        tag: tag || 'businto_alert',
        organisationPrefix: 'Businto' // Required for US carrier compliance
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Brevo SMS Error:', data);
      return { success: false, error: data.message || 'Failed to send SMS' };
    }

    console.log(`✅ SMS sent successfully to ${recipient} (ID: ${data.messageId})`);
    return { success: true, messageId: data.messageId };
  } catch (error) {
    console.error('💥 SMS send failure:', error);
    // Don't throw - SMS should be non-blocking for the main app flow
    return { success: false, error };
  }
}

/**
 * SMS Templates for specific events
 */
export const smsTemplates = {
  newRequestAlert: (data: { serviceType: string; location: string; requestId: string; claimLink: string }) => ({
    content: `[Businto] New 🚌 ${data.serviceType} Request in ${data.location}. View & Quote: ${data.claimLink}`,
    tag: 'operator_new_request'
  }),
  
  quoteAccepted: (data: { operatorName: string; requestId: string; appUrl: string }) => ({
    content: `[Businto] 🎉 Quote Accepted! ${data.operatorName} is confirmed for your trip. View details: ${data.appUrl}/trips/${data.requestId}`,
    tag: 'user_quote_accepted'
  }),
  
  newMessage: (data: { senderName: string; requestId: string; appUrl: string }) => ({
    content: `[Businto] New message from ${data.senderName} regarding Trip #${data.requestId.slice(0, 8)}. Read: ${data.appUrl}/trips/${data.requestId}`,
    tag: 'new_message_alert'
  })
};
