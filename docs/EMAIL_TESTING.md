# Email Testing Guide

## Overview
Test the complete email notification system for Businto users using **Ethereal Email** - a free testing service that captures emails without actually sending them to real inboxes.

## Setup

### No Configuration Required! 🎉
The system uses **Ethereal Email** which automatically creates test accounts on demand. No API keys or signup needed!

### How It Works
- First time you send an email, Ethereal creates a temporary test account
- Credentials are logged to your console
- All emails are captured and can be viewed via preview links
- Perfect for development and testing

### Start Development Server
```bash
cd /Users/kalinovdameus/Developer/businto
npm run dev
```

## Testing Emails

### Visit the Test Page
Navigate to: **http://localhost:3000/test-email**

### Email Types Available

#### 1. **Request Confirmation** 
- **When**: Immediately after user submits a transport request
- **Contains**: Pickup/dropoff locations, date, service type
- **Purpose**: Confirm request received and being processed

#### 2. **Quote Received**
- **When**: Operator submits a quote for the request  
- **Contains**: Operator name, price, vehicle type
- **Purpose**: Notify user to review and compare quotes

#### 3. **Booking Confirmation**
- **When**: User accepts a quote and creates a booking
- **Contains**: Confirmation code, full trip details, operator info
- **Purpose**: Confirm booking and provide trip reference

#### 4. **Payment Success**
- **When**: Payment is processed successfully
- **Contains**: Amount paid, confirmation code
- **Purpose**: Receipt confirmation

## How to Test

1. **Open Test Page**: http://localhost:3000/test-email
2. **Enter Any Email**: Can be fake (e.g., test@example.com) - it won't be sent
3. **Select Email Type**: Choose from dropdown
4. **Click Send**: Email will be "sent" to Ethereal
5. **Click Preview Link**: Opens the email in your browser instantly!

### What You'll See:
- ✅ Success message with preview link
- 🔗 Click "View Email Preview" to see the actual email
- 📧 Console logs show Ethereal account details and message ID

## Troubleshooting

### Email Not Sending
- Check console for Ethereal account creation logs
- Verify nodemailer is installed: `npm list nodemailer`
- Check for any error messages in terminal

### Preview Link Not Working
- Make sure you clicked the link that appears after sending
- Link opens in new tab showing the full email
- Ethereal keeps emails for 7 days

### First Time Setup
On first email send, you'll see console output like:
```
📧 Ethereal Email Account Created:
   Email: random123@ethereal.email
   Password: secretpassword
✅ Email sent successfully!
📧 Preview URL: https://ethereal.email/message/xxxxx
```

### Test Data
All test emails use realistic data:
- User: John Smith
- Service: School Run to Lincoln Elementary
- Price: $420.00
- Operator: Alpha Transit Services

## Production Setup

### When Ready for Production:

**Option 1: Resend (Recommended)**
1. Sign up at [resend.com](https://resend.com)
2. Add API key to env: `RESEND_API_KEY=re_xxx`
3. Update `/src/lib/email.ts` to use Resend instead of Ethereal
4. Verify your domain for better deliverability

**Option 2: SendGrid, Mailgun, etc.**
1. Modify `/src/lib/email.ts` to use your preferred service
2. Nodemailer supports all major email providers

### For Now (Development):
✅ **Ethereal is perfect!** No setup, no cost, instant previews.

## Email Templates

Templates are located in: `/src/lib/email.ts`

Each template includes:
- Responsive HTML design
- Branded colors (Indigo/Purple gradient)
- Clear call-to-action buttons
- Professional formatting
- Footer with copyright

## Next Steps

To integrate email sending into actual form submissions:
1. Import `sendEmail` and `emailTemplates` from `@/lib/email`
2. Call after successful request creation
3. Pass user data to appropriate template
4. Handle errors gracefully (email failure shouldn't break form submission)
