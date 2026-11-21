import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { MathfieldElement } from 'mathlive';
import type { FormulaPack } from '../../src/packs/types';
const sample = JSON.parse(readFileSync(new URL('../../src/packs/examples/linear-algebra.mathpack.json', import.meta.url), 'utf8')) as FormulaPack;
const field = (page: Page) => page.locator('#math-editor');
const pack = (): FormulaPack => ({ schemaVersion: 1, id: 'test-pack', name: '测试公式包', version: '1.0.0', author: '本地测试', description: '离线测试', snippets: [{ id: 'custom', command: 'customtest', aliases: ['ceshi'], name: '测试公式', description: '静态数据', latex: 'x+1', parameters: [] }] });
async function open(page: Page) { await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('button', { name: '公式包', exact: true }).click(); await expect(page.locator('#formula-pack-manager')).toBeVisible(); }
async function close(page: Page) { await page.getByRole('button', { name: '返回编辑器', exact: true }).click(); await expect(field(page)).toBeFocused(); }
async function start(page: Page) { await page.goto('/'); await expect.poll(() => page.evaluate(() => (globalThis as any).mathInput.packs.ready)).toBe(true); await field(page).click(); await expect(field(page)).toBeFocused(); }
async function set(page: Page, latex: string) { await page.evaluate(latex => { const editor = (globalThis as any).mathInput.editor; editor.setLatex(latex); editor.focus(); }, latex); await expect(field(page)).toBeFocused(); }
async function previewImport(page: Page, value: unknown) { await page.getByRole('button', { name: '粘贴 JSON 导入' }).click(); await page.getByRole('textbox', { name: '公式包 JSON' }).fill(typeof value === 'string' ? value : JSON.stringify(value)); await page.getByRole('button', { name: '校验并预览' }).click(); }
test.beforeEach(async ({ page }) => start(page));
test('v03: manager counts, toggles and restarts preserve draft and active matrix session', async ({ page }) => {
    await open(page);
    await expect(page.locator('.pack-row[data-pack-id="basic-math"]')).toContainText('13 个公式');
    await expect(page.locator('.pack-row[data-pack-id="linear-algebra"]')).toContainText('27 个公式');
    await page.getByRole('checkbox', { name: '启用 线性代数', exact: true }).check();
    await close(page);
    await page.keyboard.type('mat2');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('7');
    await page.keyboard.press('Tab');
    const before = await field(page).evaluate(el => ({ value: (el as MathfieldElement).value, selection: (el as MathfieldElement).selection }));
    await open(page);
    await page.getByRole('checkbox', { name: '启用 线性代数', exact: true }).uncheck();
    await close(page);
    expect(await field(page).evaluate(el => (el as MathfieldElement).value)).toBe(before.value);
    expect(await field(page).evaluate(el => (el as MathfieldElement).selection)).toEqual(before.selection);
    expect(await page.evaluate(() => (globalThis as any).mathInput.editor.placeholders.stack.depth)).toBe(1);
    await page.keyboard.insertText('8');
    await page.keyboard.press('Enter');
    const saved = await page.locator('#output-preview').innerText();
    await page.reload();
    await expect(page.locator('#output-preview')).toHaveText(saved);
    await field(page).click();
    await expect(field(page)).toBeFocused();
    await set(page, '');
    await page.keyboard.type('mat2');
    await expect(page.locator('#completion-popup')).toBeHidden();
    await open(page);
    await expect(page.getByRole('checkbox', { name: '启用 线性代数', exact: true })).not.toBeChecked();
    await page.getByRole('checkbox', { name: '启用 线性代数', exact: true }).check();
    await close(page);
    await set(page, '');
    await page.keyboard.type('mat2');
    await expect(page.locator('.candidate.active')).toHaveAttribute('data-command', 'mat2');
});
test('v03: native-style file import preview, browser export and semantic reimport', async ({ page }) => {
    await open(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入公式包', exact: true }).click();
    await (await chooser).setFiles({ name: 'example.mathpack.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack())) });
    await page.getByRole('button', { name: '校验并预览' }).click();
    await expect(page.locator('.import-preview')).toContainText('1 个公式');
    await page.getByRole('button', { name: '确认导入' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
    const file = await download;
    const data = JSON.parse(readFileSync((await file.path())!, 'utf8'));
    expect(data).toEqual(pack());
    await previewImport(page, data);
    await page.getByRole('button', { name: '确认导入' }).click();
    await expect(page.locator('#pack-status')).toContainText('已存在');
    await page.getByRole('checkbox', { name: '替换现有公式包' }).check();
    await page.getByRole('button', { name: '确认导入' }).click();
    await expect(page.locator('.pack-details h3')).toHaveText('测试公式包');
});
test('v03: invalid imports explain location, future versions, injection and oversized files', async ({ page }) => {
    await open(page);
    for (const value of ['{bad', { ...pack(), schemaVersion: 99 }, { ...pack(), id: '../outside' }, { ...pack(), snippets: [{ ...pack().snippets[0], latex: '\\href{https://example.com}{x}' }] }, { ...pack(), snippets: [{ ...pack().snippets[0], latex: '\\notacommand{x}' }] }, ' '.repeat(262145)]) {
        await previewImport(page, value);
        await expect(page.locator('#pack-status')).toContainText('$');
        await expect(page.getByRole('button', { name: '确认导入' })).toHaveCount(0);
        await page.getByRole('button', { name: '取消导入' }).click();
    }
    expect(await page.evaluate(() => (globalThis as any).mathInput.packs.state.revision)).toBe(0);
});
test('v03: metadata HTML stays literal and never creates executable DOM', async ({ page }) => {
    const value = pack();
    value.name = '<img src=x onerror="window.injected=1">';
    value.snippets[0].name = '<script>window.injected=1</script>';
    await open(page);
    await previewImport(page, value);
    await page.getByRole('button', { name: '确认导入' }).click();
    await expect(page.locator('.pack-details h3')).toHaveText(value.name);
    expect(await page.locator('#formula-pack-manager script,#formula-pack-manager img').count()).toBe(0);
    expect(await page.evaluate(() => (globalThis as any).injected)).toBeUndefined();
});
test('v03: create parameters with insertion UI, reorder and test independently before saving', async ({ page }) => {
    await set(page, 'A+B');
    await open(page);
    await page.getByRole('button', { name: '查看 我的公式' }).click();
    await page.getByRole('button', { name: '新增公式', exact: true }).click();
    await page.getByRole('textbox', { name: '公式名称', exact: true }).fill('可编辑比值');
    await page.getByRole('textbox', { name: '命令缩写' }).fill('myratio');
    await page.getByRole('textbox', { name: '公式别名' }).fill('bili');
    await page.getByRole('textbox', { name: 'LaTeX 模板' }).fill('\\frac{}{}');
    await page.locator('#formula-latex').evaluate((el: any) => el.setSelectionRange(6, 6));
    await page.getByRole('button', { name: '添加参数并插入槽位' }).click();
    await page.getByRole('textbox', { name: '参数 1 ID' }).fill('numerator');
    await page.getByRole('textbox', { name: '参数 1 默认值' }).fill('k+t');
    await page.locator('#formula-latex').evaluate((el: any) => el.setSelectionRange(el.value.length - 1, el.value.length - 1));
    await page.getByRole('button', { name: '添加参数并插入槽位' }).click();
    await page.getByRole('textbox', { name: '参数 2 默认值' }).fill('n');
    await page.getByRole('textbox', { name: '参数 2 ID' }).fill('denominator');
    await page.getByRole('button', { name: '上移参数 2' }).click();
    await page.getByRole('combobox', { name: '包裹目标' }).selectOption('numerator');
    await expect(page.locator('#formula-latex')).toHaveValue('\\frac{{{numerator}}}{{{denominator}}}');
    await page.getByRole('button', { name: '测试公式', exact: true }).click();
    const testField = page.locator('#formula-test-field');
    await expect(testField).toBeFocused();
    const testTooltip = page.locator('#formula-test-parameter-tooltip');
    await expect(testTooltip).toBeVisible();
    expect(await testTooltip.evaluate(el => el.getBoundingClientRect().top >= document.querySelector('#formula-test-field')!.getBoundingClientRect().bottom)).toBe(true);
    expect(await testField.evaluate(el => (el as MathfieldElement).getValue((el as MathfieldElement).selection, 'latex'))).toBe('n');
    await page.keyboard.insertText('7');
    await page.keyboard.press('Tab');
    expect(await testField.evaluate(el => (el as MathfieldElement).getValue((el as MathfieldElement).selection, 'latex'))).toBe('k+t');
    await page.keyboard.insertText('9');
    await page.keyboard.press('Enter');
    await expect(page.locator('#formula-test-output')).toHaveText('\\frac97');
    expect(await page.evaluate(() => (globalThis as any).mathInput.editor.latex)).toBe('A+B');
    await page.getByRole('button', { name: '保存公式', exact: true }).click();
    await expect(page.locator('.formula-row')).toContainText('myratio');
    await close(page);
    await set(page, '');
    await page.keyboard.type('bili');
    await expect(page.locator('.candidate.active')).toHaveAttribute('data-command', 'myratio');
});
test('v03: save current fixed formula, edit, duplicate, delete confirmations and persistence', async ({ page }) => {
    await set(page, '\\left(A^T\\right)^{-1}=\\left(A^{-1}\\right)^T');
    const original = await page.locator('#output-preview').innerText();
    await page.getByRole('button', { name: '保存为模板', exact: true }).click();
    await page.getByRole('textbox', { name: '公式名称', exact: true }).fill('逆转置');
    await page.getByRole('textbox', { name: '命令缩写' }).fill('invtrans');
    await page.getByRole('button', { name: '保存公式', exact: true }).click();
    await close(page);
    await expect(page.locator('#output-preview')).toHaveText(original);
    await open(page);
    await page.getByRole('button', { name: '查看 我的公式' }).click();
    await page.getByRole('button', { name: '编辑 逆转置', exact: true }).click();
    await page.getByRole('textbox', { name: 'LaTeX 模板' }).fill('x+2');
    await page.getByRole('button', { name: '保存公式', exact: true }).click();
    await page.getByRole('button', { name: '复制 逆转置', exact: true }).click();
    await page.getByRole('button', { name: '保存公式', exact: true }).click();
    await expect(page.locator('.formula-row')).toHaveCount(2);
    await page.getByRole('button', { name: '删除 逆转置 副本', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.formula-row')).toHaveCount(2);
    await page.getByRole('button', { name: '删除 逆转置 副本', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
    await expect(page.locator('.formula-row')).toHaveCount(1);
    await close(page);
    await page.reload();
    await field(page).click();
    await expect(field(page)).toBeFocused();
    await set(page, '');
    await page.keyboard.type('invtrans');
    await page.keyboard.press('Enter');
    await expect(page.locator('#output-preview')).toHaveText('$x+2$');
});
test('v03: conflicts retain stable sources, local aliases, disable and rename resolve them', async ({ page }) => {
    const value = pack();
    value.snippets[0].command = 'sqrt';
    value.snippets[0].aliases = ['customalias'];
    await open(page);
    await previewImport(page, value);
    await expect(page.locator('.import-preview')).toContainText('命令冲突 sqrt');
    await page.getByRole('button', { name: '确认导入' }).click();
    await close(page);
    await page.keyboard.type('sqrt');
    await expect(page.locator('#completion-popup .candidate')).toHaveCount(2);
    await expect(page.locator('#completion-popup .candidate').first()).toHaveAttribute('data-pack-id', 'basic-math');
    await expect(page.locator('#completion-popup .candidate').last()).toContainText('测试公式包');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('textbox', { name: '自定义别名' }).fill('frac=customalias');
    await page.getByRole('button', { name: '保存设置' }).click();
    await set(page, '');
    await page.keyboard.type('customalias');
    await expect(page.locator('#completion-popup .candidate')).toHaveCount(2);
    await expect(page.locator('#completion-popup .candidate').first()).toHaveAttribute('data-command', 'frac');
    await open(page);
    await page.getByRole('button', { name: '查看 测试公式包' }).click();
    await expect(page.locator('.pack-conflicts')).toContainText('本机别名');
    await page.getByRole('checkbox', { name: '启用 测试公式包', exact: true }).uncheck();
    await expect(page.locator('.pack-conflicts')).toHaveCount(0);
    await page.getByRole('checkbox', { name: '启用 测试公式包', exact: true }).check();
    await page.getByRole('button', { name: '编辑 测试公式', exact: true }).click();
    await page.getByRole('textbox', { name: '命令缩写' }).fill('renamed');
    await page.getByRole('textbox', { name: '公式别名' }).fill('');
    await page.getByRole('button', { name: '保存公式', exact: true }).click();
    await expect(page.locator('.pack-conflicts')).toHaveCount(0);
});
test('v03: failed persistence leaves pack, active draft and saved revision intact', async ({ page }) => {
    await set(page, 'x+7');
    await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === 'math-input.formula-packs.v1')
        throw new DOMException('Disk quota failure', 'QuotaExceededError'); return original.call(this, key, value); }; });
    await open(page);
    await page.getByRole('checkbox', { name: '启用 线性代数', exact: true }).click();
    await expect(page.locator('#pack-status')).toContainText('quota');
    await expect(page.getByRole('checkbox', { name: '启用 线性代数', exact: true })).not.toBeChecked();
    await close(page);
    await expect(page.locator('#output-preview')).toHaveText('$x+7$');
});
test('v03: create, edit and delete a user pack with confirmation and stable identity', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '创建公式包', exact: true }).click();
    await page.getByRole('textbox', { name: '公式包 ID', exact: true }).fill('classroom');
    await page.getByRole('textbox', { name: '公式包名称', exact: true }).fill('课堂公式');
    await page.getByRole('textbox', { name: '公式包版本' }).fill('1.2.0');
    await page.getByRole('textbox', { name: '作者', exact: true }).fill('本机用户');
    await page.getByRole('button', { name: '保存公式包', exact: true }).click();
    await page.getByRole('button', { name: '查看 课堂公式' }).click();
    await page.getByRole('button', { name: '编辑公式包', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '公式包 ID', exact: true })).toHaveAttribute('readonly', '');
    await page.getByRole('textbox', { name: '公式包名称', exact: true }).fill('课堂公式二');
    await page.getByRole('button', { name: '保存公式包', exact: true }).click();
    await page.getByRole('button', { name: '删除公式包', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.pack-row[data-pack-id=classroom]')).toHaveCount(1);
    await page.getByRole('button', { name: '删除公式包', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
    await expect(page.locator('.pack-row[data-pack-id=classroom]')).toHaveCount(0);
});
test('v03: nested custom fraction and matrix retain defaults and return to parent parameter', async ({ page }) => {
    const value = pack();
    value.snippets = [{ id: 'ratio', command: 'customratio', aliases: [], name: '自定义分式', description: '', latex: '\\frac{{{top}}}{{{bottom}}}', parameters: [{ id: 'top', name: '分子', description: '', defaultValue: 'k+t' }, { id: 'bottom', name: '分母', description: '', defaultValue: 'n' }], wrapTarget: 'top' }];
    await page.evaluate(async (value) => { await (globalThis as any).mathInput.packs.install(value); await (globalThis as any).mathInput.packs.toggle('linear-algebra', true); }, value);
    await page.keyboard.type('customratio');
    await page.keyboard.press('Enter');
    await page.keyboard.type('mat2');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (globalThis as any).mathInput.editor.placeholders.stack.depth)).toBe(2);
    await page.keyboard.insertText('7');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (globalThis as any).mathInput.editor.placeholders.stack.depth)).toBe(1);
    await page.keyboard.press('Tab');
    expect(await field(page).evaluate(el => (el as MathfieldElement).getValue((el as MathfieldElement).selection, 'latex'))).toBe('n');
    await page.keyboard.insertText('8');
    await page.keyboard.press('Enter');
    const result = await page.locator('#output-preview').innerText();
    expect(result).toContain('\\begin{pmatrix}');
    expect(result).toContain('7');
    expect(result).toContain('b');
    expect(result).toContain('{8}');
    expect(await field(page).evaluate(el => (el as MathfieldElement).getPrompts())).toEqual([]);
});
for (const command of ['transpose', 'inverse', 'adjugate', 'vector', 'norm', 'determinant'])
    test(`v03 wrapping: ${command} preserves grouped explicit A+B`, async ({ page }) => {
        await page.evaluate(() => (globalThis as any).mathInput.packs.toggle('linear-algebra', true));
        await set(page, 'A+B');
        await field(page).evaluate(el => (el as MathfieldElement).select());
        await page.keyboard.press('Control+Space');
        await page.locator(`#completion-popup .candidate[data-command="${command}"]`).click({ modifiers: ['Shift'] });
        expect(await page.evaluate(() => (globalThis as any).mathInput.editor.placeholders.stack.current?.snippet.command)).toBe(command);
        await page.keyboard.press('Enter');
        const result = await field(page).evaluate(el => ({ latex: (el as MathfieldElement).getValue('latex-expanded'), errors: (el as MathfieldElement).errors, prompts: (el as MathfieldElement).getPrompts() }));
        expect(result.errors).toEqual([]);
        expect(result.prompts).toEqual([]);
        expect(result.latex).toContain('A+B');
        if (command === 'vector')
            expect(result.latex).toContain('\\overrightarrow{A+B}');
        else {
            expect(result.latex).toContain('\\left');
            expect(result.latex).toContain('\\right');
        }
        if (command === 'inverse')
            expect(result.latex).toContain('^{-1}');
    });
test('v03: left-term wrapping and configurable nonpriority selection preserve context', async ({ page }) => {
    await page.evaluate(() => (globalThis as any).mathInput.packs.toggle('linear-algebra', true));
    await set(page, 'A+B');
    await page.keyboard.type('transpose');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.press('Enter');
    expect(await page.locator('#output-preview').innerText()).toContain('A+\\left(B\\right)');
    const value = pack();
    value.snippets = [{ id: 'part', command: 'partwrap', aliases: [], name: '左侧项优先', description: '', latex: '\\left({{body}}\\right)^{T}', parameters: [{ id: 'body', name: '主体', description: '', defaultValue: 'x' }], wrapTarget: 'body', preferSelection: false }];
    await page.evaluate(value => (globalThis as any).mathInput.packs.install(value), value);
    await set(page, 'A+B');
    await field(page).evaluate(el => (el as MathfieldElement).select());
    await page.keyboard.press('Control+Space');
    await page.locator('#completion-popup .candidate[data-command=partwrap]').click({ modifiers: ['Shift'] });
    await page.keyboard.press('Enter');
    expect(await page.locator('#output-preview').innerText()).toContain('A+\\left(B\\right)');
});
test('v03: mouse scrolling a long completion menu keeps its position and accepts the intended item', async ({ page }) => {
    await page.evaluate(() => (globalThis as any).mathInput.packs.toggle('linear-algebra', true));
    await page.keyboard.press('Control+Space');
    const menu = page.locator('#completion-popup');
    await menu.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => menu.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
    await page.locator('#completion-popup .candidate[data-command=vector]').click();
    expect(await page.evaluate(() => (globalThis as any).mathInput.editor.placeholders.stack.current?.snippet.command)).toBe('vector');
    await expect(field(page)).toBeFocused();
});

test('v03: a completed matrix can be wrapped as a whole in transpose',async({page})=>{
    await page.evaluate(()=>(globalThis as any).mathInput.packs.toggle('linear-algebra',true));await page.keyboard.type('mat2');await page.keyboard.press('Enter');await page.keyboard.press('Enter');await field(page).evaluate(el=>(el as MathfieldElement).select());await page.keyboard.press('Control+Space');await page.locator('#completion-popup .candidate[data-command=transpose]').click({modifiers:['Shift']});await page.keyboard.press('Enter');
    const result=await field(page).evaluate(el=>({latex:(el as MathfieldElement).getValue('latex-expanded'),errors:(el as MathfieldElement).errors,prompts:(el as MathfieldElement).getPrompts()}));expect(result.errors).toEqual([]);expect(result.prompts).toEqual([]);expect(result.latex).toContain('\\begin{pmatrix}');expect(result.latex).toContain('\\right)^{T}');
});
test('v03: corrupted library recovers from backup without deleting corrupt data or draft', async ({ page }) => {
    await page.evaluate(async () => { const packs = (globalThis as any).mathInput.packs; await packs.toggle('linear-algebra', true); await packs.toggle('linear-algebra', false); });
    await set(page, 'x+42');
    await page.evaluate(() => localStorage.setItem('math-input.formula-packs.v1', '{broken'));
    await page.reload();
    await expect(field(page)).toBeVisible();
    await expect(page.locator('#output-preview')).toHaveText('$x+42$');
    await open(page);
    await expect(page.locator('#pack-status')).toContainText('未能读取');
    await expect(page.getByRole('checkbox', { name: '启用 线性代数', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '从本地备份恢复' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '启用 线性代数', exact: true })).toBeChecked();
    expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('math-input.formula-packs.v1.corrupt.') && localStorage.getItem(key) === '{broken'))).toBe(true);
    await close(page);
    await expect(page.locator('#output-preview')).toHaveText('$x+42$');
});
test('v03: stored parser errors are isolated and repairable without losing the pack', async ({ page }) => {
    const value = pack();
    value.snippets[0].latex = '\\notacommand{x}';
    await page.evaluate(value => { const state = (globalThis as any).mathInput.packs.state; state.packs.push({ enabled: true, pack: value }); localStorage.setItem('math-input.formula-packs.v1', JSON.stringify(state)); }, value);
    await page.reload();
    await expect.poll(() => page.evaluate(() => (globalThis as any).mathInput.packs.ready)).toBe(true);
    await field(page).click();
    await expect(field(page)).toBeFocused();
    await page.keyboard.type('customtest');
    await expect(page.locator('#completion-popup .candidate[data-command=customtest]')).toHaveCount(0);
    await open(page);
    await expect(page.locator('.pack-row[data-pack-id=test-pack]')).toContainText('解析异常');
    await page.getByRole('button', { name: '查看 测试公式包' }).click();
    await page.getByRole('button', { name: '编辑 测试公式', exact: true }).click();
    await page.getByRole('textbox', { name: 'LaTeX 模板' }).fill('x+9');
    await page.getByRole('button', { name: '保存公式', exact: true }).click();
    await expect(page.locator('.pack-row[data-pack-id=test-pack]')).not.toContainText('解析异常');
});
for (const snippet of sample.snippets)
    test(`v03 linear algebra: ${snippet.command} real parsing, defaults, ordered prompts and export`, async ({ page }) => {
        await page.evaluate(() => (globalThis as any).mathInput.packs.toggle('linear-algebra', true));
        await page.keyboard.type(snippet.command);
        await expect(page.locator('#completion-popup .candidate.active')).toHaveAttribute('data-command', snippet.command);
        await page.keyboard.press('Enter');
        expect(await field(page).evaluate(el => (el as MathfieldElement).errors)).toEqual([]);
        for (let index = 0; index < snippet.parameters.length; index++) {
            const selected = await page.evaluate(() => { const editor = (globalThis as any).mathInput.editor; const current = editor.placeholders.stack.current; const id = current.promptIds[current.index]; return { index: current.index, id, selected: editor.field.getValue(editor.field.selection, 'latex'), whole: editor.field.getPromptValue(id, 'latex') }; });
            expect(selected.index).toBe(index);
            expect(selected.id).toContain('-' + snippet.parameters[index].id);
            expect(selected.selected).toBe(selected.whole);
            expect(selected.selected.length).toBeGreaterThan(0);
            await page.keyboard.insertText(String(100 + index));
            expect(await field(page).evaluate((el, id) => (el as MathfieldElement).getPromptValue(id, 'latex'), selected.id)).toBe(String(100 + index));
            await page.keyboard.press('Tab');
        }
        const result = await field(page).evaluate(el => ({ latex: (el as MathfieldElement).getValue('latex-expanded'), prompts: (el as MathfieldElement).getPrompts(), errors: (el as MathfieldElement).errors }));
        expect(result.prompts).toEqual([]);
        expect(result.errors).toEqual([]);
        for (let i = 0; i < snippet.parameters.length; i++)
            expect(result.latex).toContain(String(100 + i));
        if (snippet.command === 'blockmat') {
            expect(result.latex).not.toContain('\\hline');
            expect(result.latex).toContain('c|c');
        }
    });
