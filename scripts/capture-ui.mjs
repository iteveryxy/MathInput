import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => console.error(error));
  await page.goto('http://127.0.0.1:1420');
  await page.locator('math-field').click();
  await page.keyboard.type('s');
  await page.locator('.candidate[data-command="sqrt"]').waitFor();
  await page.screenshot({ path: 'reports/editor-ui.png' });
  console.log((await page.locator('.candidate-preview').first().innerHTML()).slice(0, 1200));
} finally { await browser.close(); }
