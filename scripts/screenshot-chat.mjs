import { chromium } from '../node_modules/@playwright/test/index.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Hero section - crop just the right-side chat panel
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
// Get the hero section (forms area)
await page.waitForSelector('[class*="grid"]', { timeout: 5000 });
await page.screenshot({ path: '/tmp/hero-chat-full.png', clip: { x: 700, y: 60, width: 740, height: 560 } });
console.log('Hero chat panel saved');

await browser.close();
