import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.js.stripe.com https://js.stripe.com https://checkout.stripe.com https://maps.googleapis.com https://*.sentry.io https://vercel.live",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://*.stripe.com https://maps.googleapis.com https://maps.gstatic.com https://*.googleusercontent.com",
              "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://maps.googleapis.com https://*.sentry.io https://*.supabase.co wss://*.supabase.co",
              "frame-src 'self' https://*.js.stripe.com https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "intelogroup",
  project: "businto",
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress source map uploading logs during build
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces
  widenClientFileUpload: true,

  // Delete source maps after upload so they aren't served publicly
  sourcemaps: {
    filesToDeleteAfterUpload: [".next/static/**/*.map"],
  },
});
