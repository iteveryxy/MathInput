import { test, expect } from '@playwright/test';
import type { MathfieldElement } from 'mathlive';
for (const [id, latex, defaults] of [
    ['matrix2', '\\begin{pmatrix}{{a}}&{{b}}\\\\{{c}}&{{d}}\\end{pmatrix}', ['a', 'b', 'c', 'd']],
    ['matrix3', '\\begin{pmatrix}{{a}}&{{b}}&{{c}}\\\\{{d}}&{{e}}&{{f}}\\\\{{g}}&{{h}}&{{i}}\\end{pmatrix}', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']],
    ['detprobe', '\\begin{vmatrix}{{a}}&{{b}}\\\\{{c}}&{{d}}\\end{vmatrix}', ['a', 'b', 'c', 'd']],
    ['blockprobe', '\\left[\\begin{array}{c|c}{{a}}&{{b}}\\\\{{c}}&{{d}}\\end{array}\\right]', ['A', 'B', 'C', 'D']],
    ['systemprobe', '\\begin{cases}{{a}}\\\\{{b}}\\end{cases}', ['x+y=1', 'x-y=0']],
] as const) {
    test(`v03 Phase 0: external JSON ${id} uses real prompts and declared Tab order`, async ({ page }) => {
        await page.goto('/');
        const field = page.locator('math-field');
        await field.click();
        await expect(field).toBeFocused();
        const parameters = defaults.map((value, i) => ({ id: String.fromCharCode(97 + i), name: `参数 ${i + 1}`, description: '公开 Prompt 实测', defaultValue: value }));
        await page.evaluate(snippet => {
            const editor = (globalThis as any).mathInput.editor;
            editor.registry.register(JSON.parse(JSON.stringify(snippet)));
        }, { id, command: id, aliases: [], name: id, description: 'External JSON probe', latex, parameters });
        await page.keyboard.type(id);
        await expect(page.locator(`.candidate[data-command=${id}]`)).toBeVisible();
        await page.keyboard.press('Enter');
        expect(await field.evaluate(el => (el as MathfieldElement).errors)).toEqual([]);
        for (let i = 0; i < defaults.length; i++) {
            expect(await field.evaluate(el => (el as MathfieldElement).getValue((el as MathfieldElement).selection, 'latex'))).toBe(defaults[i]);
            await page.keyboard.insertText(String(10 + i));
            await page.keyboard.press('Tab');
        }
        const result = await field.evaluate(el => ({ latex: (el as MathfieldElement).getValue('latex-expanded'), prompts: (el as MathfieldElement).getPrompts() }));
        expect(result.prompts).toEqual([]);
        for (let i = 0; i < defaults.length; i++)
            expect(result.latex).toContain(String(10 + i));
        expect(result.latex).toContain('\\begin{');
        expect(result.latex).not.toContain('placeholder');
        await page.evaluate(({ id, result }) => { (globalThis as any).packProbe = { id, ...result }; }, { id, result });
    });
}
test('v03 Phase 0: unsupported hline is explicitly reported by public parser errors', async ({ page }) => {
    await page.goto('/');
    const field = page.locator('math-field');
    await field.click();
    await expect(field).toBeFocused();
    await field.evaluate(el => (el as MathfieldElement).setValue('\\begin{array}{c|c}A&B\\\\\\hline C&D\\end{array}'));
    expect(await field.evaluate(el => (el as MathfieldElement).errors.some(error => error.code === 'unknown-command' && error.arg === '\\hline'))).toBe(true);
});
