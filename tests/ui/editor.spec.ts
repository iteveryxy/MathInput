import { test, expect, type Page } from '@playwright/test';
import type { MathfieldElement } from 'mathlive';

const field = (page: Page) => page.locator('math-field');
async function latex(page: Page): Promise<string> { return page.locator('#output-preview').innerText(); }
async function setLatex(page: Page, value: string): Promise<void> {
  await page.evaluate((value) => {
    (globalThis as unknown as { mathInput: { editor: { setLatex(s: string): void; focus(): void } } }).mathInput.editor.setLatex(value);
    (document.querySelector('math-field') as MathfieldElement).focus();
  }, value);
}
async function command(page: Page, name: string): Promise<void> {
  await page.keyboard.type(name);
  await expect(page.locator(`.candidate[data-command="${name}"]`)).toBeVisible();
  await page.keyboard.press('Enter');
}
async function depth(page: Page, value: number): Promise<void> { await expect(page.locator('#parameter-tooltip')).toHaveAttribute('data-depth', String(value)); }

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(field(page)).toBeVisible();
  await field(page).click();
  // MathLive completes keyboard focus asynchronously after reporting hasFocus().
  await expect(field(page)).toBeFocused();
});

test('A: 候选方向键后继续输入，焦点保留', async ({ page }) => {
  await page.keyboard.type('s');
  await expect(page.locator('.candidate')).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.candidate.active')).toHaveAttribute('data-command', 'sum');
  await page.keyboard.type('q');
  await expect(page.locator('.candidate')).toHaveCount(1);
  await expect(page.locator('.candidate.active')).toHaveAttribute('data-command', 'sqrt');
  expect(await field(page).evaluate((el) => (el as MathfieldElement).hasFocus())).toBe(true);
});

test('文本服务可在没有 ASCII keydown 的情况下触发补全', async ({ page }) => {
  await page.keyboard.insertText('frac');
  await expect(page.locator('.candidate.active')).toHaveAttribute('data-command', 'frac');
  await page.keyboard.press('Enter'); await depth(page, 1);
  await page.keyboard.insertText('1'); await page.keyboard.press('Tab');
  await page.keyboard.insertText('2'); await page.keyboard.press('Enter');
  expect(await latex(page)).toBe('$\\frac12$'); // MathLive normalizes single-token fraction arguments.
});

test('窗口聚焦事件不会重置用户选区', async ({ page }) => {
  await setLatex(page, 'x+1'); await page.keyboard.press('Control+a');
  const selected = await field(page).evaluate((el) => (el as MathfieldElement).selection.ranges[0]);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect(await field(page).evaluate((el) => (el as MathfieldElement).selection.ranges[0])).toEqual(selected);
  await page.keyboard.insertText('frac');
  expect(await latex(page)).toBe('$frac$');
});

test('B: Enter 提前完成 sum，其余默认值保留，不提交', async ({ page }) => {
  await command(page, 'sum');
  await page.keyboard.type('v');
  await page.keyboard.press('Enter');
  await depth(page, 0);
  await expect(page.locator('#last-result')).toBeHidden();
  expect(await latex(page)).toMatch(/\\sum/);
  expect(await latex(page)).toContain('v=k');
  expect(await latex(page)).toContain('k+t');
  expect(await latex(page)).toContain('x_{i}'); // MathLive expanded export braces scripts.
  expect(await field(page).evaluate((el) => (el as MathfieldElement).position === (el as MathfieldElement).lastOffset)).toBe(true);
  expect(await field(page).evaluate((el) => (el as MathfieldElement).getPrompts())).toEqual([]);
});

test('C D: Tab 顺序、参数提示和 k+t 整体覆盖', async ({ page }) => {
  await command(page, 'sum');
  await page.keyboard.type('v'); await page.keyboard.press('Tab');
  await expect(page.locator('#parameter-tooltip')).toContainText('起点');
  await page.keyboard.type('1'); await page.keyboard.press('Tab');
  await expect(page.locator('#parameter-tooltip')).toContainText('终点');
  expect(await field(page).evaluate((el) => (el as MathfieldElement).getValue((el as MathfieldElement).selection, 'latex'))).toBe('k+t');
  await page.keyboard.type('n'); await page.keyboard.press('Tab');
  await expect(page.locator('#parameter-tooltip')).toContainText('求和表达式');
  await page.keyboard.type('2'); await page.keyboard.press('Tab');
  await depth(page, 0);
  expect(await latex(page)).toContain('v=1'); expect(await latex(page)).toContain('^{n}'); expect(await latex(page)).not.toContain('k+t');
});

test('E: sqrt 包裹 a+b 的左侧项 b', async ({ page }) => {
  await setLatex(page, 'a+b'); await page.keyboard.type('sqrt'); await page.keyboard.press('Shift+Enter'); await page.keyboard.press('Enter');
  expect(await latex(page)).toBe('$a+\\sqrt{b}$');
});
test('F: 括号作为完整节点被包裹', async ({ page }) => {
  await setLatex(page, '(a+b)'); await page.keyboard.type('sqrt'); await page.keyboard.press('Shift+Enter'); await page.keyboard.press('Enter');
  expect(await latex(page)).toBe('$\\sqrt{(a+b)}$');
});
test('G: 指数外部与内部包裹层级不同', async ({ page }) => {
  await setLatex(page, 'x^2'); await page.keyboard.type('sqrt'); await page.keyboard.press('Shift+Enter'); await page.keyboard.press('Enter');
  expect(await latex(page)).toBe('$\\sqrt{x^2}$');
  await setLatex(page, 'x^2');
  await field(page).evaluate((el) => { const mf = el as MathfieldElement; for (let i = 0; i <= mf.lastOffset; i++) if (mf.getElementInfo(i)?.latex === '2') mf.position = i; });
  await page.keyboard.type('sqrt'); await page.keyboard.press('Shift+Enter'); await page.keyboard.press('Enter');
  expect(await latex(page)).toBe('$x^{\\sqrt2}$'); // Equivalent single-token radical serialization.
});
test('H: 连续数字 23 与隐式乘法 2x', async ({ page }) => {
  await page.keyboard.type('23'); expect(await latex(page)).toBe('$23$');
  await setLatex(page, '2x'); await page.keyboard.type('sqrt'); await page.keyboard.press('Shift+Enter'); await page.keyboard.press('Enter');
  expect(await latex(page)).toBe('$\\sqrt{2x}$');
});
test('I: 分子 Ctrl Right 跳过整个幂，v02 Alt Right 跳出分式', async ({ page }) => {
  await setLatex(page, '\\frac{x^2+y}{a+b}');
  await field(page).evaluate((el) => { (el as MathfieldElement).position = 1; });
  await page.keyboard.press('Control+ArrowRight');
  expect(await field(page).evaluate((el) => { const mf = el as MathfieldElement; return mf.getValue([1, mf.position], 'latex'); })).toBe('x^2');
  await page.keyboard.press('Alt+ArrowRight'); // v0.2 explicitly moves container exit to Alt; same range assertion.
  expect(await field(page).evaluate((el) => (el as MathfieldElement).position === (el as MathfieldElement).lastOffset)).toBe(true);
});
test('J: frac → sqrt → frac，内层完成恢复父参数', async ({ page }) => {
  await command(page, 'frac'); await depth(page, 1);
  await command(page, 'sqrt'); await depth(page, 2);
  await command(page, 'frac'); await depth(page, 3);
  await page.keyboard.type('1'); await page.keyboard.press('Tab'); await page.keyboard.type('2'); await page.keyboard.press('Enter'); await depth(page, 2);
  await page.keyboard.press('Enter'); await depth(page, 1);
  await page.keyboard.press('Tab'); await expect(page.locator('#parameter-tooltip')).toContainText('分母');
  await page.keyboard.type('3'); await page.keyboard.press('Enter'); await depth(page, 0);
  expect(await latex(page)).toBe('$\\frac{\\sqrt{\\frac12}}{3}$'); // Canonical single-token fraction arguments.
});
test('显式选区优先于左侧数学项，鼠标候选不抢焦点', async ({ page }) => {
  await setLatex(page, 'x+1'); await page.keyboard.press('Control+a'); await page.keyboard.type('sqrt'); await page.keyboard.press('Shift+Enter'); await page.keyboard.press('Enter');
  expect(await latex(page)).toBe('$\\sqrt{x+1}$');
  await setLatex(page, ''); await page.keyboard.type('fr'); await page.locator('.candidate[data-command="frac"]').click();
  await depth(page, 1); expect(await field(page).evaluate((el) => (el as MathfieldElement).hasFocus())).toBe(true);
});
test('IME composition 期间不补全、不提交、不分发结构快捷键', async ({ page }) => {
  await page.keyboard.type('s');
  await field(page).dispatchEvent('compositionstart', { data: 'shu' });
  await expect(page.locator('#completion-popup')).toBeHidden();
  await field(page).evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, composed: true })));
  await expect(page.locator('#last-result')).toBeHidden();
  await field(page).dispatchEvent('compositionend', { data: '' });
  await setLatex(page, ''); await command(page, 'sqrt'); await depth(page, 1);
});
test('撤销重做可恢复模板会话，结构选区可按路径收缩', async ({ page }) => {
  await command(page, 'frac'); await page.keyboard.press('Enter'); await depth(page, 0);
  await page.keyboard.press('Control+z'); await depth(page, 1);
  await page.keyboard.press('Control+y'); await depth(page, 0);
  await setLatex(page, 'a+2x');
  await page.keyboard.press('Alt+Shift+ArrowRight');
  const first = await field(page).evaluate((el) => (el as MathfieldElement).selection.ranges[0]);
  await page.keyboard.press('Alt+Shift+ArrowRight'); await page.keyboard.press('Alt+Shift+ArrowLeft');
  expect(await field(page).evaluate((el) => (el as MathfieldElement).selection.ranges[0])).toEqual(first);
});
test('输出模式、失败保留结果、L: Esc 取消保留草稿', async ({ page }) => {
  await setLatex(page, '\\frac{x+1}{y}'); await page.selectOption('#output-mode', 'block');
  expect(await latex(page)).toBe('$$\n\\frac{x+1}{y}\n$$');
  await page.keyboard.press('Enter');
  await expect(page.locator('#status')).toContainText('浏览器预览模式');
  await expect(page.locator('#last-result')).toBeVisible();
  await field(page).click(); await page.keyboard.press('Escape');
  await expect(page.locator('#status')).toContainText('草稿保留');
  await page.reload(); expect(await latex(page)).toBe('$$\n\\frac{x+1}{y}\n$$');
});
test('自定义别名可编辑保存，候选公式使用数学渲染', async ({ page }) => {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('textbox', { name: '自定义别名' }).fill('sqrt=kg2'); await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.locator('#settings-panel')).toBeHidden();
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('kg2');
  await expect(page.locator('.candidate.active')).toHaveAttribute('data-command', 'sqrt');
  await expect(page.locator('.candidate-preview .ML__latex .ML__sqrt-sign')).toBeVisible();
  await page.screenshot({ path: 'reports/editor-ui.png' });
});
