<todos title="Fix Brevo corrupted tracking links in operator emails" rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">
- [x] 1: Create a comprehensive error logger in src/lib/email-logger.ts with structured logging for email sending, link validation, and Brevo integration issues 🔴
- [x] 2: Update sendEmail() to accept trackingClicks parameter and disable tracking for operatorNewRequest emails via X-Mailin-Track-Click header 🔴
- [x] 3: Add pre-send validation to check claim links are properly formatted before inserting into HTML 🔴
- [x] 4: Log and validate Brevo SMTP responses to catch corruption issues early 🟡
</todos>

<!-- Auto-generated todo section -->
<!-- Add your custom Copilot instructions below -->
