import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
try {
  const page=await browser.newPage({viewport:{width:420,height:224}});
  await page.goto('http://127.0.0.1:1420'); await page.waitForSelector('math-field');
  await page.evaluate(()=>document.body.classList.add('desktop'));
  await page.locator('math-field').click(); await page.keyboard.type('s');
  await page.locator('#completion-popup').waitFor({state:'visible'});
  await page.screenshot({path:'reports/ui-v02-compact.png'});
  const geometry=await page.evaluate(()=>({shell:document.querySelector('#app').getBoundingClientRect().toJSON(),editor:document.querySelector('math-field').getBoundingClientRect().toJSON(),popup:document.querySelector('#completion-popup').getBoundingClientRect().toJSON(),side:document.querySelector('#completion-popup').dataset.side}));
  await page.evaluate(()=>{mathInput.editor.setLatex('2x^2+3y');mathInput.editor.field.focus();mathInput.editor.field.position=2;});
  await page.keyboard.press('Control+Shift+ArrowLeft'); await page.keyboard.press('Control+Shift+ArrowLeft');
  await page.screenshot({path:'reports/ui-v02-selection.png'});
  writeFileSync('reports/v02-ui-geometry.json',JSON.stringify(geometry,null,2)); console.log(JSON.stringify(geometry));
} finally {await browser.close();}
