import { expect, test, type Page } from '@playwright/test';
import type { MathfieldElement } from 'mathlive';

const field = (page: Page) => page.locator('math-field');
async function reset(page: Page, value = '') {
  await page.evaluate(value => {
    const editor = (globalThis as unknown as {mathInput: {editor: {setLatex(s:string):void; field:MathfieldElement}}}).mathInput.editor;
    editor.setLatex(value); editor.field.focus();
  }, value);
  await expect(field(page)).toBeFocused();
}
async function menuInside(page: Page) {
  const menu = page.locator('#completion-popup'); await expect(menu).toBeVisible();
  await expect.poll(async () => {
    const box = await menu.boundingBox(); const viewport = page.viewportSize()!;
    return !!box && box.x >= 7 && box.y >= 7 && box.x + box.width <= viewport.width - 7 && box.y + box.height <= viewport.height - 7;
  }).toBe(true);
}
test.beforeEach(async ({page}) => { await page.goto('/'); await expect(field(page)).toBeVisible(); await field(page).click(); await expect(field(page)).toBeFocused(); });

test('v02 F: s ↓ q 浮层不改变主区域位置或高度，光标附近且不抢焦点', async ({page}) => {
  await page.setViewportSize({width:420, height:280}); await page.evaluate(() => document.body.classList.add('desktop'));
  const before = await page.locator('#app').boundingBox(); const editorBefore = await field(page).boundingBox();
  await page.keyboard.type('s'); await expect(page.locator('.candidate')).toHaveCount(3);
  await page.keyboard.press('ArrowDown'); await expect(page.locator('.candidate.active')).toHaveAttribute('data-command','sum');
  await page.keyboard.type('q'); await expect(page.locator('.candidate')).toHaveCount(1);
  await expect(page.locator('.candidate.active')).toHaveAttribute('data-command','sqrt');
  await menuInside(page); await expect(field(page)).toBeFocused();
  const after = await page.locator('#app').boundingBox(); const editorAfter = await field(page).boundingBox();
  for (const property of ['x','y','height'] as const) expect(Math.abs(after![property]-before![property])).toBeLessThanOrEqual(1);
  expect(Math.abs(editorAfter!.y-editorBefore!.y)).toBeLessThanOrEqual(1);
  const menu = await page.locator('#completion-popup').boundingBox();
  const anchor = Number(await page.locator('#completion-popup').getAttribute('data-anchor-bottom'));
  expect(Math.abs(menu!.y - anchor)).toBeLessThanOrEqual(130); // Internal flip may place the menu above the caret.
  await page.locator('.candidate').click(); await expect(page.locator('#parameter-tooltip')).toHaveAttribute('data-depth','1');
  await expect(field(page)).toBeFocused();
});

for (const edge of ['top','bottom','left','right'] as const) {
  test(`v02 G: 光标接近 ${edge} 时菜单内部翻转和裁界`, async ({page}) => {
    await page.setViewportSize({width:420,height:320});
    await page.evaluate(edge => {
      const container=document.querySelector<HTMLElement>('#editor-container')!;
      Object.assign(container.style,{position:'fixed',width:'180px',left:edge==='right'?'auto':'8px',right:edge==='right'?'8px':'auto',top:edge==='bottom'?'auto':'8px',bottom:edge==='bottom'?'8px':'auto'});
    }, edge);
    await reset(page); await page.keyboard.type('s'); await menuInside(page);
    if (edge==='bottom') await expect(page.locator('#completion-popup')).toHaveAttribute('data-side','top');
    if (edge==='top') await expect(page.locator('#completion-popup')).toHaveAttribute('data-side','bottom');
    await expect(field(page)).toBeFocused();
    const glyph=await field(page).evaluate(el=>{const mf=el as MathfieldElement; const b=mf.getElementInfo(mf.position)?.bounds; return b?{top:b.top,bottom:b.bottom}:null;});
    const menu=await page.locator('#completion-popup').boundingBox(); expect(glyph).not.toBeNull();
    // The editor includes padding/empty space; the visible mathematical glyph
    // (public bounds), rather than its background, must remain unobscured.
    expect(menu!.y+menu!.height<=glyph!.top-3 || menu!.y>=glyph!.bottom+3).toBe(true);
  });
}

for (const scale of [65,85,100,125]) {
  test(`v02 H: ${scale}% 缩放、持久化、鼠标定位和参数提示`, async ({page}) => {
    await page.getByRole('button',{name:'设置',exact:true}).click();
    const slider=page.getByRole('slider',{name:'界面缩放'}); await slider.focus(); await slider.press('Home');
    for(let i=65;i<scale;i++) await slider.press('ArrowRight');
    await expect(slider).toHaveValue(String(scale));
    await expect(page.locator('#scale-value')).toHaveText(`${scale}%`);
    await page.getByRole('button',{name:'保存设置'}).click();
    await page.reload(); await expect(field(page)).toBeVisible(); await field(page).click();
    expect(await page.evaluate(()=>Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')))).toBe(scale/100);
    await reset(page, 'x+1');
    const bounds=await field(page).evaluate(el=>{const b=(el as MathfieldElement).getElementInfo(1)?.bounds; return b?{right:b.right,top:b.top,height:b.height}:null;});
    expect(bounds).not.toBeNull(); await page.mouse.click(bounds!.right-1,bounds!.top+bounds!.height/2);
    expect(await field(page).evaluate(el=>(el as MathfieldElement).position)).toBe(1);
    await page.keyboard.type('2'); expect(await field(page).evaluate(el=>(el as MathfieldElement).value)).toBe('x2+1');
    await reset(page); await page.keyboard.type('fr'); await menuInside(page);
    await page.locator('.candidate[data-command=frac]').click(); await expect(field(page)).toBeFocused();
    await expect(page.locator('#parameter-tooltip')).toHaveAttribute('data-depth','1');
    await page.keyboard.type('7'); await page.keyboard.press('Tab');
    await expect(page.locator('#parameter-tooltip')).toContainText('分母');
    const box=await field(page).boundingBox(); expect(box!.height).toBeGreaterThan(30);
  });
}

test('v02: 非紧凑模式、取消缩放预览、长公式滚动及浮层内部滚动', async ({page}) => {
  await page.getByRole('button',{name:'设置',exact:true}).click(); await page.getByRole('checkbox',{name:'紧凑模式',exact:true}).uncheck();
  await page.getByRole('button',{name:'保存设置'}).click(); await expect(page.locator('body')).not.toHaveClass(/compact/);
  await page.getByRole('button',{name:'设置',exact:true}).click(); const slider=page.getByRole('slider',{name:'界面缩放'}); await slider.press('End');
  await page.locator('#settings-cancel').click();
  expect(await page.evaluate(()=>Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')))).toBe(.85);
  await page.setViewportSize({width:420,height:300}); await reset(page,'x+'.repeat(35)+'y');
  await page.keyboard.press('Control+Space'); await menuInside(page);
  for(let i=0;i<12;i++) await page.keyboard.press('ArrowDown');
  const active=page.locator('.candidate.active'); await expect(active).toHaveAttribute('data-command','pi');
  const row=await active.boundingBox(); const menu=await page.locator('#completion-popup').boundingBox();
  expect(row!.y).toBeGreaterThanOrEqual(menu!.y); expect(row!.y+row!.height).toBeLessThanOrEqual(menu!.y+menu!.height+1);
  await expect(field(page)).toBeFocused();
});

test('v02: 深层公式可滚动查看，补全随局部滚动和视口尺寸更新', async ({page}) => {
  await page.setViewportSize({width:420,height:360}); await page.evaluate(()=>document.body.classList.add('desktop'));
  let formula='x'; for(let i=0;i<12;i++) formula=`\\dfrac{${formula}}{y}`;
  await reset(page,formula);
  await expect.poll(()=>page.locator('#editor-container').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await page.keyboard.type('s'); await menuInside(page);
  await page.locator('#editor-container').evaluate(el=>{el.scrollTop=0; el.dispatchEvent(new Event('scroll'));});
  await menuInside(page);
  await page.setViewportSize({width:340,height:260}); await menuInside(page); await expect(field(page)).toBeFocused();
});
