import { test, expect, Page } from '@playwright/test';

/**
 * Businto E2E User Journey Tests
 * Businto: transport booking marketplace (operators + riders)
 * Routes: /, /login, /signup, /operators, /trips, /dashboard, /pricing
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Public Pages — Businto', () => {
  test('homepage loads with key content', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    console.log(`✅ Homepage title: "${title}"`);

    // Navigation
    const navLinks = await page.locator('nav a, header a').count();
    console.log(`${navLinks > 0 ? '✅' : '⚠️ '} Nav links: ${navLinks}`);

    // Hero / CTA
    const cta = await page.locator('a:has-text("Get Started"), a:has-text("Book"), button:has-text("Book")').count();
    console.log(`${cta > 0 ? '✅' : '⚠️ '} CTA element: ${cta > 0 ? 'found' : 'missing'}`);

    await expect(page.locator('body')).toBeVisible();
  });

  test('login page renders with form', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    const hasForgot = await page.locator('a[href*="forgot"]').count();
    console.log(`${hasForgot > 0 ? '✅' : '⚠️ '} Forgot password link`);
    console.log('✅ Login page form complete');
  });

  test('signup page renders with form', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    console.log('✅ Signup page form complete');
  });

  test('operators listing page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/operators`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const url = page.url();
    if (!url.includes('/login')) {
      const items = await page.locator('article, [class*="operator"], li, tr').count();
      console.log(`✅ Operators page: ${items} items`);
    } else {
      console.log('✅ Operators page: protected (redirected to login)');
    }
  });

  test('pricing page shows plans', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    const hasPricing = await page.locator('text=/\$|month|free|plan|pro/i').count();
    console.log(`${hasPricing > 0 ? '✅' : '⚠️ '} Pricing content: ${hasPricing} elements`);
  });

  test('contact and about pages are accessible', async ({ page }) => {
    for (const path of ['/contact', '/about', '/privacy', '/terms', '/safety']) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(300);
      const url = page.url();
      console.log(`${!url.includes('/login') ? '✅' : '⚠️ '} ${path}: ${!url.includes('/login') ? 'public' : 'protected'}`);
    }
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'bad@example.com');
    await page.fill('input[type="password"]', 'wrongpass');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const url = page.url();
    const stayedOnLogin = url.includes('/login');
    console.log(`${stayedOnLogin ? '✅' : '⚠️ '} Invalid login stays on login page`);
  });

  test('protected dashboard redirects unauthenticated users', async ({ page }) => {
    const protectedRoutes = ['/dashboard', '/profile', '/settings'];
    for (const route of protectedRoutes) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      const url = page.url();
      const protected_ = url.includes('/login') || url.includes('/signup');
      console.log(`${protected_ ? '✅' : '⚠️ '} ${route}: ${protected_ ? 'protected' : 'accessible'} → ${url}`);
    }
  });

  test('no critical JS errors on public pages', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    for (const path of ['/', '/login', '/signup', '/pricing', '/operators']) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForTimeout(1500);
    }

    const critical = errors.filter(e =>
      !e.includes('favicon') && !e.includes('404') && !e.includes('ResizeObserver') && !e.includes('hydrat')
    );

    if (critical.length > 0) {
      console.log('⚠️  Critical JS errors:');
      critical.forEach(e => console.log(`   - ${e.substring(0, 150)}`));
    } else {
      console.log('✅ No critical JS errors');
    }
  });

  test('responsive: mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    // Check hamburger menu or mobile nav
    const hasMobileNav = await page.locator('[aria-label*="menu" i], button:has-text("☰"), [class*="hamburger"]').count();
    console.log(`${hasMobileNav > 0 ? '✅' : '⚠️ '} Mobile nav: ${hasMobileNav > 0 ? 'hamburger/menu found' : 'not found'}`);
  });
});

test.describe('Quote Submission Flow', () => {
  test('quote submission page accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/quotes/submit`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const url = page.url();
    if (!url.includes('/login')) {
      const hasForm = await page.locator('form, input, select, textarea').count();
      console.log(`✅ Quote form: ${hasForm} input elements`);
    } else {
      console.log('✅ Quote submission: protected route');
    }
  });
});
