import { expect, test, type Page } from '@playwright/test';
import type { MathfieldElement } from 'mathlive';

const field = (page: Page) => page.locator('math-field');
const value = (page: Page) => field(page).evaluate(el => (el as MathfieldElement).getValue('latex'));
const selection = (page: Page) => field(page).evaluate(el => { const mf = el as MathfieldElement; return mf.getValue(mf.selection, 'latex'); });
async function set(page: Page, latex: string, position?: number) {
  await page.evaluate(({ latex, position }) => {
    const editor = (globalThis as unknown as { mathInput: { editor: { setLatex(s: string): void; field: MathfieldElement } } }).mathInput.editor;
    editor.setLatex(latex); editor.field.focus();
    if (position !== undefined) editor.field.position = position;
  }, { latex, position });
  await expect(field(page)).toBeFocused();
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(field(page)).toBeVisible(); await field(page).click(); });

test('v02 A: 删除参数与单侧括号后，函数名先高亮再原子删除，支持 Undo', async ({ page }) => {
  await set(page, '\\sin(x)');
  await page.keyboard.press('Backspace');
  expect(await value(page)).toContain('('); expect(await value(page)).not.toContain(')');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  expect(await value(page)).toBe('\\sin');
  await page.keyboard.press('Backspace');
  expect(await value(page)).toBe('\\sin'); expect(await selection(page)).toBe('\\sin');
  await expect(field(page)).toHaveAttribute('data-semantic-selection', 'true');
  await page.keyboard.press('Backspace'); expect(await value(page)).toBe('');
  await page.keyboard.press('Control+z'); expect(await value(page)).toBe('\\sin');
  await set(page, 'sinValue'); await page.keyboard.press('Backspace'); expect(await value(page)).toBe('sinValu');
  await set(page, 'sin'); await page.keyboard.press('Backspace'); expect(await value(page)).toBe('si');
});

test('v02 B: 双方向选择完整函数、真实选区高亮、删除及一次撤销', async ({ page }) => {
  const original = 'a+\\sin\\left(x\\right)+b';
  await set(page, original, 6);
  await page.keyboard.press('Control+Shift+ArrowLeft');
  expect(await selection(page)).toBe('\\sin\\left(x\\right)');
  await expect(field(page)).toHaveAttribute('data-semantic-selection', 'true');
  await page.keyboard.press('Backspace'); expect(await value(page)).toBe('a++b');
  await page.keyboard.press('Control+z'); expect(await value(page)).toBe(original);
  expect(await selection(page)).not.toBe(original); // Undo must never select unrelated context.
  await set(page, original, 2); await page.keyboard.press('Control+Shift+ArrowRight');
  expect(await selection(page)).toBe('\\sin\\left(x\\right)');
  await page.keyboard.press('Delete'); expect(await value(page)).toBe('a++b');
  await page.keyboard.type('c'); expect(await value(page)).toContain('c');
});

test('v02 C: Unwrap 保留全部内容，并拒绝分式及带指数的函数', async ({ page }) => {
  for (const [input, output] of [['\\sin\\left(x+1\\right)', 'x+1'], ['(a+b)', 'a+b'], ['\\left(a+b\\right)', 'a+b'], ['\\sqrt{x+1}', 'x+1']]) {
    await set(page, input); await page.keyboard.press('Control+Alt+u'); expect(await value(page)).toBe(output);
    await page.keyboard.press('Control+z'); expect(await value(page)).toBe(input);
  }
  for (const input of ['\\frac{x}{y}', '\\sqrt[3]{x}', '\\sin^2\\left(x\\right)']) {
    await set(page, input); await page.keyboard.press('Control+Alt+u'); expect(await value(page)).toBe(input);
  }
});

test('v02 D: 底数、幂、乘法项、分支递增，反向精确收缩，Esc 只清选择', async ({ page }) => {
  await set(page, '2x^2+3y', 2);
  for (const expected of ['x', 'x^2', '2x^2', '2x^2+3y']) {
    await page.keyboard.press('Control+Shift+ArrowLeft'); expect(await selection(page)).toBe(expected);
  }
  for (const expected of ['2x^2', 'x^2', 'x', '']) {
    await page.keyboard.press('Control+Shift+ArrowRight'); expect(await selection(page)).toBe(expected);
  }
  await page.keyboard.press('Control+Shift+ArrowLeft'); await page.keyboard.press('Escape');
  expect(await selection(page)).toBe(''); await expect(page.locator('#status')).not.toContainText('已取消');
  await page.keyboard.press('ArrowRight'); await page.keyboard.type('7');
  await expect(field(page)).not.toHaveAttribute('data-semantic-selection', 'true');
});

test('v02 E: 嵌套配对跳转、智能括号单侧删除和未配对降级', async ({ page }) => {
  await set(page, '(a+(b+c))', 4); await page.keyboard.press('Control+m');
  expect(await field(page).evaluate(el => (el as MathfieldElement).position)).toBe(8);
  await page.keyboard.press('Control+m'); expect(await field(page).evaluate(el => (el as MathfieldElement).position)).toBe(3);
  await set(page, '\\left(a+b\\right)'); await page.keyboard.press('Backspace');
  expect(await value(page)).toContain('('); expect(await value(page)).not.toContain(')');
  await set(page, '\\left(a+b\\right)', 0); await page.keyboard.press('Delete');
  expect(await value(page)).toContain(')'); expect(await value(page)).not.toContain('(');
  await set(page, '(a+b', 0); await page.keyboard.press('Control+m'); expect(await value(page)).toBe('(a+b');
});

test('v02: Ctrl 删除数学项、空分子继续输入、Alt 跳出且阻止浏览器后退', async ({ page }) => {
  await set(page, 'a+2x^2'); await page.keyboard.press('Control+Backspace'); expect(await value(page)).toBe('a+');
  await page.keyboard.press('Control+z'); expect(await value(page)).toBe('a+2x^2');
  await set(page, '\\frac{x+1}{y}', 4); await page.keyboard.press('Control+Backspace');
  await page.keyboard.type('9'); expect(await value(page)).toContain('9'); expect(await value(page)).toContain('y');
  await page.evaluate(() => history.pushState({}, '', '/?navigation-test'));
  await set(page, '\\frac{x+1}{y}', 2); await page.keyboard.press('Alt+ArrowRight');
  expect(await field(page).evaluate(el => (el as MathfieldElement).position === (el as MathfieldElement).lastOffset)).toBe(true);
  expect(page.url()).toContain('navigation-test');
});

test('v02: 连续结构删除各有独立 Undo/Redo，分子内不跨分母', async ({page}) => {
  await set(page, 'a+b+c');
  await page.keyboard.press('Control+Backspace'); expect(await value(page)).toBe('a+b+');
  await page.keyboard.press('Control+Backspace'); expect(await value(page)).toBe('a+b');
  await page.keyboard.press('Control+z'); expect(await value(page)).toBe('a+b+');
  await page.keyboard.press('Control+z'); expect(await value(page)).toBe('a+b+c');
  await page.keyboard.press('Control+y'); expect(await value(page)).toBe('a+b+');
  await set(page, '\\frac{x+1}{y+2}', 4);
  await page.keyboard.press('Control+Shift+ArrowLeft'); expect(await selection(page)).toBe('1');
  await page.keyboard.press('Control+Shift+ArrowLeft'); expect(await selection(page)).toBe('x+1');
  await page.keyboard.press('Control+Shift+ArrowRight'); expect(await selection(page)).toBe('1');
  await page.keyboard.press('Escape'); await page.keyboard.press('Control+m');
  expect(await value(page)).toBe('\\frac{x+1}{y+2}');
});

test('v02: 结构选区可由模板包裹，参数默认选区 Esc 仍取消，鼠标选区可精细替换', async ({page}) => {
  await set(page, 'a+\\sin\\left(x\\right)+b', 6);
  await page.keyboard.press('Control+Shift+ArrowLeft'); await page.keyboard.press('Control+Space');
  await page.keyboard.press('Shift+Enter'); await page.keyboard.press('Enter');
  expect(await page.locator('#output-preview').innerText()).toBe('$a+\\sqrt{\\sin\\left(x\\right)}+b$');
  await set(page, ''); await page.keyboard.type('frac'); await page.keyboard.press('Enter');
  await page.keyboard.press('Escape'); await expect(page.locator('#status')).toContainText('已取消');
  await set(page, 'abc');
  const bounds=await field(page).evaluate(el=>{const mf=el as MathfieldElement; const a=mf.getElementInfo(1)!.bounds!; const c=mf.getElementInfo(3)!.bounds!; return {x1:a.left,y:a.top+a.height/2,x2:c.right};});
  await page.mouse.move(bounds.x1,bounds.y); await page.mouse.down(); await page.mouse.move(bounds.x2,bounds.y,{steps:6}); await page.mouse.up();
  expect(await selection(page)).toBe('abc'); await page.keyboard.type('7'); expect(await value(page)).toBe('7');
});
