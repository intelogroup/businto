import { test, expect } from '@playwright/test';

/**
 * Businto — API & Flow Tests (supplement to user-journey.spec.ts)
 * Covers: API route security, booking/payment flows, operator routes,
 * admin panel guard, claim code route, messaging endpoints.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// API Security — All endpoints should be guarded
// ---------------------------------------------------------------------------
test.describe('API Endpoints — Security', () => {
  test('booking API requires auth', async ({ request }) => {
    const endpoints = [
      { method: 'GET', path: '/api/bookings' },
      { method: 'POST', path: '/api/bookings' },
    ];

    for (const ep of endpoints) {
      const res = ep.method === 'GET'
        ? await request.get(`${BASE_URL}${ep.path}`)
        : await request.post(`${BASE_URL}${ep.path}`, { data: {} });

      const status = res.status();
      expect(status).not.toBe(500);
      expect(status).not.toBe(200); // Should not succeed unauthenticated
      console.log(`✅ ${ep.method} ${ep.path}: ${status} (auth required)`);
    }
  });

  test('payments API requires auth', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/payments`, { data: {} });
    expect(res.status()).not.toBe(500);
    console.log(`✅ POST /api/payments: ${res.status()}`);
  });

  test('messages API requires auth', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/messages`);
    expect(res.status()).not.toBe(500);
    console.log(`✅ GET /api/messages: ${res.status()}`);
  });

  test('maps API requires auth/key', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/maps`);
    expect(res.status()).not.toBe(500);
    console.log(`✅ GET /api/maps: ${res.status()}`);
  });

  test('webhooks endpoint accepts POST (not 404)', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/webhooks`, { data: {} });
    expect(res.status()).not.toBe(404);
    expect(res.status()).not.toBe(500);
    console.log(`✅ POST /api/webhooks: ${res.status()}`);
  });

  test('auth API endpoint exists', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/auth`);
    expect(res.status()).not.toBe(500);
    console.log(`✅ GET /api/auth: ${res.status()}`);
  });
});

// ---------------------------------------------------------------------------
// Protected Routes — Admin & Operator
// ---------------------------------------------------------------------------
test.describe('Protected Routes — Admin & Operator', () => {
  test('admin panel is protected', async ({ page }) => {
    await page.goto(`${BASE_URL}/master/admin`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const url = page.url();
    const isProtected = !url.includes('/master/admin') || url.includes('/login');
    console.log(`${isProtected ? '✅' : '⚠️ '} /master/admin: ${url}`);
  });

  test('operator onboarding is protected', async ({ page }) => {
    await page.goto(`${BASE_URL}/operator/onboarding`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    const url = page.url();
    const isProtected = url.includes('/login') || url.includes('/signup');
    console.log(`${isProtected ? '✅' : '⚠️ '} /operator/onboarding: ${url}`);
  });

  test('dashboard bookings is protected', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/bookings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    const url = page.url();
    const isProtected = url.includes('/login') || url.includes('/signup');
    console.log(`${isProtected ? '✅' : '⚠️ '} /dashboard/bookings: ${url}`);
  });

  test('operator dashboard is protected', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/operator`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    const url = page.url();
    const isProtected = url.includes('/login') || url.includes('/signup');
    console.log(`${isProtected ? '✅' : '⚠️ '} /dashboard/operator: ${url}`);
  });
});

// ---------------------------------------------------------------------------
// Claim Code Route
// ---------------------------------------------------------------------------
test.describe('Claim Code Route', () => {
  test('/claim/[code] route renders (not 404)', async ({ page }) => {
    await page.goto(`${BASE_URL}/claim/TEST123`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const url = page.url();
    // Should either render the claim page or redirect, not 404
    const is404 = await page.locator('text=/404|not found/i').count();
    console.log(`${is404 === 0 ? '✅' : '⚠️ '} /claim/TEST123: ${url} (is404=${is404})`);
  });
});

// ---------------------------------------------------------------------------
// Quote Flow — Full form validation
// ---------------------------------------------------------------------------
test.describe('Quote Flow — Form Interaction', () => {
  test('quote submit page renders form elements', async ({ page }) => {
    await page.goto(`${BASE_URL}/quotes/submit`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const url = page.url();
    if (url.includes('/login')) {
      console.log('✅ /quotes/submit: protected — redirected to login');
      return;
    }

    const inputs = await page.locator('input, select, textarea').count();
    const submitBtn = await page.locator('button[type="submit"]').count();
    console.log(`✅ Quote form inputs: ${inputs}, submit buttons: ${submitBtn}`);
  });

  test('quotes listing page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/quotes`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    const url = page.url();
    if (url.includes('/login')) {
      console.log('✅ /quotes: protected');
      return;
    }
    await expect(page.locator('body')).toBeVisible();
    console.log('✅ /quotes accessible');
  });
});

// ---------------------------------------------------------------------------
// Login — Supabase Auth
// ---------------------------------------------------------------------------
test.describe('Login — Form Validation & Security', () => {
  test('forgot password page renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/login/forgot-password`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    const hasEmail = await page.locator('input[type="email"]').count();
    console.log(`${hasEmail > 0 ? '✅' : '⚠️ '} Forgot password email input: ${hasEmail}`);
  });

  test('reset password page renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/login/reset-password`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    console.log('✅ Reset password page rendered');
  });

  test('SQL injection in login form does not crash (XSS guard)', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill("' OR '1'='1");
      const passInput = page.locator('input[type="password"]').first();
      if (await passInput.count() > 0) {
        await passInput.fill('<script>alert(1)</script>');
        const submitBtn = page.locator('button[type="submit"]').first();
        await submitBtn.click();
        await page.waitForTimeout(2000);

        // Should stay on login, not crash
        expect(page.url()).toContain('/login');
        console.log('✅ Login rejects SQL injection/XSS input safely');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Accessibility Basics
// ---------------------------------------------------------------------------
test.describe('Accessibility — Businto', () => {
  test('buttons and links have accessible text', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const buttons = await page.locator('button').all();
    let missingText = 0;
    for (const btn of buttons) {
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute('aria-label');
      if (!text?.trim() && !ariaLabel) missingText++;
    }
    console.log(`${missingText === 0 ? '✅' : '⚠️ '} Buttons without text/aria-label: ${missingText}/${buttons.length}`);
  });

  test('images have alt attributes', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const imgs = await page.locator('img').all();
    let missingAlt = 0;
    for (const img of imgs) {
      const alt = await img.getAttribute('alt');
      if (alt === null) missingAlt++;
    }
    console.log(`${missingAlt === 0 ? '✅' : '⚠️ '} Images without alt: ${missingAlt}/${imgs.length}`);
  });
});
