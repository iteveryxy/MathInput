import { expect, test, type Page } from '@playwright/test';
import type { FormulaPack } from '../../src/packs/types';
import type { FormulaPackService } from '../../src/packs/FormulaPackService';

function pack(id: string, name: string, command: string, latex: string): FormulaPack {
    return {
        schemaVersion: 1, id, name, version: '1.0.0', author: '', description: '',
        snippets: [{ id: 'formula', name: '同名公式', command, latex, aliases: [], parameters: [], description: '' }],
    };
}
async function openPacks(page: Page) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '公式包', exact: true }).click();
}
function choose(page: Page, files: { name: string; contents: string }[]) {
    return Promise.all([
        page.waitForEvent('filechooser').then(chooser => chooser.setFiles(files.map(file => ({
            name: file.name, mimeType: 'application/json', buffer: Buffer.from(file.contents),
        })))),
        page.getByRole('button', { name: '导入公式包', exact: true }).click(),
    ]);
}
function dropFiles(page: Page, files: { name: string; contents: string }[]) {
    return page.evaluate(items => {
        const transfer = new DataTransfer();
        for (const item of items) transfer.items.add(new File([item.contents], item.name, { type: 'application/json' }));
        const event = new DragEvent('drop', { dataTransfer: transfer, cancelable: true, bubbles: true });
        return !document.querySelector('#app')!.dispatchEvent(event);
    }, files);
}
function revision(page: Page) {
    return page.evaluate(() => (window as unknown as { mathInput: { packs: FormulaPackService } }).mathInput.packs.state.revision);
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#math-editor')).toBeFocused();
});

test('batch picker imports valid files and allows explicit selection of a same-name formula', async ({ page }) => {
    await openPacks(page);
    await choose(page, [
        { name: 'one.mathpack.json', contents: JSON.stringify(pack('one', '同名包', 'choiceone', 'x+1')) },
        { name: 'two.mathpack.json', contents: JSON.stringify(pack('two', '同名包', 'choicetwo', 'x+2')) },
        { name: 'broken.json', contents: '{bad' },
    ]);
    await expect(page.getByRole('heading', { name: '批量导入公式包' })).toBeVisible();
    await expect(page.locator('.import-preview')).toContainText('JSON 语法错误');
    await page.getByRole('button', { name: '导入选中的公式包' }).click();
    await expect(page.locator('.pack-row[data-pack-id="two"]')).toBeVisible();
    expect(await revision(page)).toBe(1);
    await page.getByRole('button', { name: '返回编辑器' }).click();
    await expect(page.locator('#math-editor')).toBeFocused();
    await page.keyboard.type('choiceone');
    const popup = page.locator('#completion-popup');
    await expect(popup.getByRole('option')).toHaveCount(2);
    await expect(popup.locator('.candidate-source')).toHaveText(['同名包 · one', '同名包 · two']);
    await expect(popup.locator('.candidate[aria-selected="true"]')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(popup).toBeVisible();
    await expect(page.locator('#output-preview')).toHaveText('$choiceone$');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.locator('#output-preview')).toHaveText('$x+2$');
});

test('dragged files preserve the active form and replacements require explicit consent', async ({ page }) => {
    await openPacks(page);
    await page.getByRole('button', { name: '创建公式包', exact: true }).click();
    await page.getByRole('textbox', { name: '公式包名称' }).fill('unsaved draft');
    expect(await dropFiles(page, [
        { name: 'new.JSON', contents: JSON.stringify(pack('batch-new', '新包', 'newcmd', '2')) },
        { name: 'replacement.json', contents: JSON.stringify(pack('my-formulas', '替换', 'mine', '3')) },
        { name: 'ignored.txt', contents: '{}' },
    ])).toBe(true);
    await expect(page.locator('#pack-status')).toContainText('文件已排队');
    await expect(page.getByRole('textbox', { name: '公式包名称' })).toHaveValue('unsaved draft');
    await page.getByRole('button', { name: '取消编辑' }).click();
    await page.getByRole('button', { name: '查看排队的文件' }).click();
    await expect(page.locator('.import-preview')).toContainText('请选择 .json 文件');
    await page.getByRole('button', { name: '导入选中的公式包' }).click();
    await expect(page.locator('#pack-status')).toContainText('已存在');
    expect(await revision(page)).toBe(0);
    await page.getByRole('checkbox', { name: '替换现有公式包' }).check();
    await page.getByRole('button', { name: '导入选中的公式包' }).click();
    await expect(page.locator('.pack-row[data-pack-id="batch-new"]')).toBeVisible();
    expect(await revision(page)).toBe(1);
});

test('language changes live and survives a reload with English import and matrix labels', async ({ page }) => {
    await page.keyboard.type('frac');
    await page.keyboard.press('Enter');
    await expect(page.locator('.parameter-tooltip strong')).toHaveText('分子');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('combobox', { name: '界面语言' }).selectOption('en');
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'Copy only' })).toBeVisible();
    await expect(page.locator('.parameter-tooltip strong')).toHaveText('Numerator');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Save template' })).toBeVisible();
    await page.getByRole('button', { name: 'Matrix', exact: true }).click();
    const matrix = page.getByRole('dialog', { name: 'Insert matrix' });
    await expect(matrix.getByRole('spinbutton', { name: 'Rows' })).toBeVisible();
    await matrix.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await dropFiles(page, [{ name: 'broken.json', contents: '{bad' }])).toBe(true);
    await expect(page.getByRole('heading', { name: 'Import formula pack files' })).toBeVisible();
    await expect(page.locator('.import-preview')).toContainText('Invalid JSON syntax');
    await page.getByRole('button', { name: 'Cancel import' }).click();
    await page.getByRole('button', { name: 'Back to editor' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('combobox', { name: 'Interface language' }).selectOption('zh-CN');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('button', { name: '保存为模板' })).toBeVisible();
});
