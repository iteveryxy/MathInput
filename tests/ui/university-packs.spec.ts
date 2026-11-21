import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { MathfieldElement } from 'mathlive';
import type { MathEditor } from '../../src/editor/MathEditor';
import type { FormulaPackService } from '../../src/packs/FormulaPackService';
import type { FormulaPack } from '../../src/packs/types';

type App = { editor: MathEditor; packs: FormulaPackService };
const matrixDialog = '插入矩阵';
const universityPacks: FormulaPack[] = ['advanced-math', 'university-linear-algebra', 'math-notation'].map(id =>
    JSON.parse(readFileSync(new URL('../../src/packs/university/' + id + '.mathpack.json', import.meta.url), 'utf8')));

test('bundled undergraduate formulas parse, insert and finish in the editor', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => (window as unknown as { mathInput: App }).mathInput?.packs.ready);
    const errors = await page.evaluate(packs => {
        const { editor, packs: service } = (window as unknown as { mathInput: App }).mathInput;
        const failures = [...service.invalidPacks.entries()].map(([id, error]) => id + ': ' + error);
        for (const pack of packs) {
            for (const snippet of pack.snippets) {
                editor.setLatex('');
                editor.accept(snippet);
                const prompts = editor.field.getPrompts().length;
                const expected = snippet.parameters.length ? snippet.parameters.length + 1 : 0;
                if (prompts !== expected || editor.field.errors.length) {
                    failures.push(pack.id + ':' + snippet.command + ' insertion ' + JSON.stringify(editor.field.errors) + ' prompts ' + prompts);
                }
                editor.placeholders.finish();
                if (!editor.latex || editor.field.getPrompts().length || editor.field.errors.length) {
                    failures.push(pack.id + ':' + snippet.command + ' finish ' + JSON.stringify(editor.field.errors));
                }
            }
        }
        return failures;
    }, universityPacks);
    expect(errors).toEqual([]);
});

test('rectangular grid edits in row order and exports every cell', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '矩阵', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: matrixDialog });
    await dialog.getByRole('spinbutton', { name: '行数' }).fill('2');
    await dialog.getByRole('spinbutton', { name: '列数' }).fill('4');
    await dialog.getByRole('combobox', { name: '样式' }).selectOption('bmatrix');
    await dialog.getByRole('button', { name: '插入', exact: true }).click();
    const field = page.locator('#math-editor');
    await expect(field).toBeFocused();
    for (let cell = 0; cell < 8; cell++) {
        await expect(page.locator('.parameter-tooltip strong')).toHaveText('第 ' + (Math.floor(cell / 4) + 1) + ' 行第 ' + (cell % 4 + 1) + ' 列');
        await page.keyboard.insertText(String(cell + 1));
        await page.keyboard.press('Tab');
    }
    expect(await field.evaluate(el => (el as MathfieldElement).getPrompts())).toEqual([]);
    await expect(page.locator('#output-preview')).toHaveText('$\\begin{bmatrix}1 & 2 & 3 & 4\\\\ 5 & 6 & 7 & 8\\end{bmatrix}$');
    await page.reload();
    await expect(page.locator('#output-preview')).toHaveText('$\\begin{bmatrix}1 & 2 & 3 & 4\\\\ 5 & 6 & 7 & 8\\end{bmatrix}$');
});

test('matrix dialog validates the determinant shape and cell limit', async ({ page }) => {
    await page.goto('/');
    const field = page.locator('#math-editor');
    await field.focus();
    await page.keyboard.type('x+1');
    await page.keyboard.press('Alt+m');
    const dialog = page.getByRole('dialog', { name: matrixDialog });
    await expect(dialog).toBeVisible();
    const rows = dialog.getByRole('spinbutton', { name: '行数' });
    const columns = dialog.getByRole('spinbutton', { name: '列数' });
    await rows.fill('4');
    await columns.fill('3');
    await dialog.getByRole('combobox', { name: '样式' }).selectOption('vmatrix');
    await dialog.getByRole('button', { name: '插入', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('行列式的行数和列数必须相同');
    await rows.fill('21');
    await columns.fill('21');
    await dialog.getByRole('button', { name: '插入', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('400');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(field).toBeFocused();
    await expect(page.locator('#output-preview')).toHaveText('$x+1$');
});

test('a wide matrix keeps its shape and supports undo and redo', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '矩阵', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: matrixDialog });
    await dialog.getByRole('spinbutton', { name: '行数' }).fill('1');
    await dialog.getByRole('spinbutton', { name: '列数' }).fill('15');
    await dialog.getByRole('button', { name: '插入', exact: true }).click();
    const field = page.locator('#math-editor');
    const promptCount = () => field.evaluate(el => (el as MathfieldElement).getPrompts().length);
    expect(await promptCount()).toBe(16);
    const output = page.locator('#output-preview');
    const value = await output.innerText();
    expect(value).toContain('\\begin{array}{ccccccccccccccc}');
    expect(value.match(/&/g)).toHaveLength(14);
    expect(value).not.toContain('\\\\');
    await page.keyboard.press('Control+z');
    expect(await promptCount()).toBe(0);
    await page.keyboard.press('Control+y');
    expect(await promptCount()).toBe(16);
    await expect(output).toHaveText(value);
    await page.keyboard.press('Enter');
    expect(await promptCount()).toBe(0);
    await expect(output).toHaveText(value);
});

test('a 1 by 400 matrix scrolls to reveal the current cell', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '矩阵', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: matrixDialog });
    await dialog.getByRole('spinbutton', { name: '行数' }).fill('1');
    await dialog.getByRole('spinbutton', { name: '列数' }).fill('400');
    await dialog.getByRole('button', { name: '插入', exact: true }).click();
    const field = page.locator('#math-editor');
    expect(await field.evaluate(el => (el as MathfieldElement).getPrompts())).toHaveLength(401);
    await page.keyboard.press('Tab');
    await expect(page.locator('.parameter-tooltip strong')).toHaveText('第 1 行第 2 列');
    for (let column = 0; column < 24; column++) await page.keyboard.press('Tab');
    await expect(page.locator('.parameter-tooltip strong')).toHaveText('第 1 行第 26 列');
    await expect.poll(() => field.evaluate(el => {
        const mathfield = el as MathfieldElement;
        const caret = mathfield.getElementInfo(mathfield.position)?.bounds;
        return !!caret && caret.right <= mathfield.getBoundingClientRect().right + 1;
    })).toBe(true);
    await page.keyboard.press('Enter');
    const output = await page.locator('#output-preview').innerText();
    expect(output.match(/&/g)).toHaveLength(399);
});

test('a 20 by 20 determinant retains all 400 cells in the draft', async ({ page }) => {
    await page.goto('/');
    const field = page.locator('#math-editor');
    await field.focus();
    await page.keyboard.type('2+');
    await page.getByRole('button', { name: '矩阵', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: matrixDialog });
    await dialog.getByRole('spinbutton', { name: '行数' }).fill('20');
    await dialog.getByRole('spinbutton', { name: '列数' }).fill('20');
    await dialog.getByRole('combobox', { name: '样式' }).selectOption('vmatrix');
    await dialog.getByRole('button', { name: '插入', exact: true }).click();
    expect(await field.evaluate(el => (el as MathfieldElement).getPrompts())).toHaveLength(401);
    await page.keyboard.insertText('7');
    await page.keyboard.press('Enter');
    const output = await page.locator('#output-preview').innerText();
    expect(output).toContain(String.raw`$2+\left|\begin{array}{cccccccccccccccccccc}7`);
    expect(output.match(/&/g)).toHaveLength(380);
    expect(output.match(/\\\\/g)).toHaveLength(19);
    expect(await field.evaluate(el => (el as MathfieldElement).getPrompts())).toEqual([]);
    await page.reload();
    await expect(page.locator('#output-preview')).toHaveText(output);
});

test('an existing library can add the bundled catalogs and enable completion', async ({ page }) => {
    const storageKey = 'math-input.formula-packs.v1';
    const existing: FormulaPack = {
        schemaVersion: 1, id: 'existing', name: '已有公式包', version: '1.0.0', author: '', description: '',
        snippets: [{ id: 'existing', command: 'existing', aliases: [], name: '已有公式', description: '', latex: 'x+1', parameters: [] }],
    };
    await page.addInitScript(({ storageKey, existing }) => {
        if (!localStorage.getItem(storageKey)) {
            localStorage.setItem(storageKey, JSON.stringify({
                schemaVersion: 1, revision: 7, baseEnabled: true, packs: [{ pack: existing, enabled: true }],
            }));
        }
    }, { storageKey, existing });
    await page.goto('/');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '公式包', exact: true }).click();
    await page.getByRole('button', { name: '添加随附本科公式包' }).click();
    await expect(page.getByRole('checkbox', { name: '启用 已有公式包' })).toBeChecked();
    const advancedMath = page.getByRole('checkbox', { name: '启用 高等数学' });
    await expect(advancedMath).not.toBeChecked();
    await advancedMath.check();
    await expect(advancedMath).toBeEnabled();
    await expect(advancedMath).toBeChecked();
    await page.getByRole('button', { name: '返回编辑器' }).click();
    await expect(page.locator('#math-editor')).toBeFocused();
    await page.keyboard.type('erchongjifen');
    await expect(page.locator('.candidate.active')).toHaveAttribute('data-command', 'doubleint');
    await page.keyboard.press('Enter');
    await expect(page.locator('#output-preview')).toContainText('\\iint');
    await page.reload();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey);
    expect(saved.packs.find((entry: { pack: FormulaPack }) => entry.pack.id === 'existing')).toEqual({ enabled: true, pack: existing });
    expect(saved.packs.find((entry: { pack: FormulaPack }) => entry.pack.id === 'advanced-math').enabled).toBe(true);
});
