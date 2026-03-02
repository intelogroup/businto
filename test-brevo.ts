
import nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testBrevo() {
    console.log('Testing Brevo SMTP with settings:');
    console.log('Host:', process.env.SMTP_HOST);
    console.log('Port:', process.env.SMTP_PORT);
    console.log('User:', process.env.SMTP_USER);

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error('❌ SMTP_USER or SMTP_PASS is missing in .env.local');
        return;
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    try {
        console.log('Verifying connection...');
        await transporter.verify();
        console.log('✅ Connection verified successfully');

        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM_EMAIL || 'test@businto.com',
            to: 'kalinovdameus@gmail.com',
            subject: 'Brevo SMTP Test - Businto Debug',
            text: 'This is a test email to verify Brevo SMTP configuration from the project root.',
            html: '<b>This is a test email to verify Brevo SMTP configuration from the project root.</b>',
        });

        console.log('✅ Message sent: %s', info.messageId);
        if (info.response) console.log('Response:', info.response);
    } catch (error) {
        console.error('❌ Error during SMTP test:', error);
    }
}

testBrevo();
