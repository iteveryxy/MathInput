import { test, expect } from '@playwright/test';
import type { MathfieldElement } from 'mathlive';

test('Phase 0: 已安装版本公开 API 实测', async ({ page }) => {
  await page.goto('/'); await page.waitForSelector('math-field');
  const actual = await page.locator('math-field').evaluate((el) => {
    const mf = el as MathfieldElement;
    mf.setValue('\\frac{\\placeholder[num]{x}}{\\placeholder[den]{k+t}}');
    const range = mf.getPromptRange('den')!;
    mf.selection = { ranges: [range] };
    const selected = mf.getValue(mf.selection, 'latex');
    mf.insert('n', { selectionMode: 'after' });
    const replaced = mf.getPromptValue('den');
    mf.selection = { ranges: [mf.getPromptRange('num')!] };
    mf.insert('\\sqrt{#0}', { selectionMode: 'after' });
    const wrapped = mf.getPromptValue('num');
    mf.executeCommand('moveToMathfieldEnd');
    const end = mf.position === mf.lastOffset;
    const info = mf.getElementInfo(mf.lastOffset);
    const exported = mf.getValue('latex-expanded');
    return { range, selected, replaced, wrapped, end, depth: info?.depth, exported };
  });
  expect(actual.selected).toBe('k+t'); expect(actual.replaced).toBe('n'); expect(actual.wrapped).toBe('\\sqrt{x}'); expect(actual.end).toBe(true); expect(actual.depth).toBe(0); expect(actual.exported).toContain('\\frac');
});
