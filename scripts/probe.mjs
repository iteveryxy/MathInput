import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e));
  await page.goto('http://127.0.0.1:1420');
  await page.waitForSelector('math-field');
  const report = await page.evaluate(async () => {
    const mf = document.querySelector('math-field');
    const inspect = () => ({ value: mf.value, selection: mf.selection, position: mf.position, lastOffset: mf.lastOffset, prompts: mf.getPrompts(), offsets: Array.from({ length: mf.lastOffset + 1 }, (_, i) => ({ i, ...mf.getElementInfo(i), bounds: undefined })) });
    mf.value = '\\placeholder[outer]{\\frac{\\placeholder[num]{x}}{\\placeholder[den]{k+t}}}';
    const initial = inspect();
    const range = mf.getPromptRange('den');
    mf.selection = { ranges: [range] };
    const selected = { range, value: mf.getValue(mf.selection, 'latex') };
    mf.executeCommand(['insert', 'n']);
    const replaced = inspect();
    const outer = mf.getPromptRange('outer');
    const num = mf.getPromptRange('num');
    mf.selection = { ranges: [num] };
    mf.insert('\\sqrt{\\placeholder[inner]{x}}', { selectionMode: 'after' });
    const nested = inspect();
    mf.value = 'a+\\frac{x^2+y}{a+b}';
    const tree = inspect();
    return { initial, selected, replaced, outer, num, nested, tree };
  });
  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/mathlive-probe.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
