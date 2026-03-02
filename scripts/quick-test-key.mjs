import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
const SMTP_PORT = 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = 'Businto <noreply@businto.com>';
const TEST_TO = 'support@tabronai.com'; // Testing with a known address

async function testSmtp() {
    console.log('Testing Brevo SMTP with provided key...');
    console.log(`User: ${SMTP_USER}`);
    
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: false, // STARTTLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },
    });

    try {
        await transporter.verify();
        console.log('✅ SMTP Connection Verified!');
        
        const info = await transporter.sendMail({
            from: FROM_EMAIL,
            to: TEST_TO,
            subject: 'Brevo SMTP Key Test',
            html: `
                <div style="font-family: sans-serif; padding: 20px;">
                <h1>Brevo SMTP Key Test</h1>
                <p>This is a test email to verify the new Brevo SMTP key provided.</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                <p>We are testing link integrity here:</p>
                <a href="https://businto.com/claim/TEST_LINK_INTEGRITY_123" style="display:inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Test Link Integrity</a>
                <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">If this link is mangled by Brevo, please check the dashboard settings.</p>
                </div>
            `
        });
        
        console.log('✅ Email Sent Successfully!');
        console.log('Message ID:', info.messageId);
    } catch (error) {
        console.error('❌ SMTP Test Failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response);
        }
    }
}

testSmtp();
