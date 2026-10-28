import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:1420');
  await page.waitForSelector('math-field');
  const projection = {};
  for (const latex of ['\\sin(x)', '\\sin\\left(x\\right)', '\\sin', 'sinValue', '2x^2+3y', '(a+(b+c))', '\\left(a+(b+c)\\right)', '\\frac{(a+b)}{y}', '\\sqrt{x}']) {
    projection[latex] = await page.evaluate((latex) => {
      const editor = globalThis.mathInput.editor;
      editor.setLatex(latex); editor.focus();
      const mf = editor.field;
      return { value: mf.value, offsets: Array.from({ length: mf.lastOffset + 1 }, (_, offset) => ({ offset, ...mf.getElementInfo(offset) })) };
    }, latex);
  }
  await page.evaluate(() => { const e = globalThis.mathInput.editor; e.setLatex('\\sin(x)'); e.focus(); });
  const deletion = [];
  for (let step = 0; step < 8; step++) {
    deletion.push(await page.evaluate(() => { const mf = document.querySelector('math-field'); return { value: mf.value, selection: mf.selection, position: mf.position }; }));
    await page.keyboard.press('Backspace');
  }
  await page.evaluate(() => { const e = globalThis.mathInput.editor; e.setLatex('\\left(a+b\\right)'); e.focus(); });
  await page.keyboard.press('Backspace');
  const smartFenceDeletion = await page.locator('math-field').evaluate(mf => mf.value);
  const report = { projection, deletion, smartFenceDeletion };
  writeFileSync('reports/v02-mathlive-current.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
