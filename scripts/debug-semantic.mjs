import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e));
  await page.goto('http://127.0.0.1:1420'); await page.waitForSelector('math-field');
  await page.locator('math-field').click();
  console.log('after click',await page.evaluate(()=>({active:document.activeElement.tagName, focus:mathInput.editor.field.hasFocus()})));
  await page.evaluate(() => {
    globalThis.keyEvents = [];
    document.addEventListener('keydown', e => keyEvents.push({key:e.key, code:e.code, ctrl:e.ctrlKey, alt:e.altKey, shift:e.shiftKey, target:e.target.tagName}),true);
    mathInput.editor.setLatex('2x^2+3y'); mathInput.editor.field.focus(); mathInput.editor.field.position=2;
  });
  await page.waitForTimeout(150);
  console.log('after set/focus',await page.evaluate(()=>({active:document.activeElement.tagName, focus:mathInput.editor.field.hasFocus()})));
  for (const key of ['Control+Shift+ArrowLeft', 'Control+Alt+u', 'Control+m', 'Control+Backspace']) {
    await page.keyboard.press(key);
    console.log(key, await page.evaluate(() => ({events:keyEvents, selection:mathInput.editor.field.selection, value:mathInput.editor.field.value, status:document.querySelector('#status').textContent, focus:mathInput.editor.field.hasFocus()})));
  }
} finally { await browser.close(); }
