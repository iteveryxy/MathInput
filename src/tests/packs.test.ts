import { describe, it, expect, vi, afterEach } from 'vitest';
import { parsePack, validatePack, validateState } from '../packs/Validation';
import { initialPackState, registeredSnippets, commandConflicts, replacePack } from '../packs/FormulaPacks';
import { FormulaPackService } from '../packs/FormulaPackService';
import { LocalPackStorage, PACK_STORAGE_KEY } from '../packs/PackStorage';
import { CompletionEngine } from '../completion/CompletionEngine';
import type { FormulaPack } from '../packs/types';
import { renderSnippet } from '../snippets/SnippetRegistry';
import { stripPrompts } from '../output/LatexExporter';
const pack = (): FormulaPack => ({ schemaVersion: 1, id: 'test-pack', name: '测试公式', version: '1.0.0', author: '测试', description: '', snippets: [{ id: 'ratio', command: 'ratio', aliases: ['bili'], name: '比值', description: '', latex: '\\frac{{{top}}}{{{bottom}}}', parameters: [{ id: 'top', name: '分子', description: '', defaultValue: 'k+t' }, { id: 'bottom', name: '分母', description: '', defaultValue: 'n' }], wrapTarget: 'top' }] });
afterEach(() => vi.unstubAllGlobals());
describe('Formula Pack contract', () => {
    it('round trips JSON without dropping data', () => { const value = pack(); expect(parsePack(JSON.stringify(value))).toEqual(value); });
    it('bundles 27 validated templates and preserves the 13-command default', () => { const state = initialPackState(); validateState(state); expect(state.packs[1].pack.snippets).toHaveLength(27); expect(registeredSnippets(state)).toHaveLength(13); });
    it.each([2, 0, '1'])('rejects unsupported schema %s', version => { const value = pack() as any; value.schemaVersion = version; expect(() => validatePack(value)).toThrow('schemaVersion'); });
    it('rejects unknown fields rather than discarding them', () => { expect(() => validatePack({ ...pack(), future: { secret: 1 } })).toThrow('future'); });
    it.each(['../escape', 'C:\\escape', '/absolute', 'bad/id', 'bad..id'])('rejects path ID %s', id => expect(() => validatePack({ ...pack(), id })).toThrow('.id'));
    it('reports duplicate snippet and parameter IDs', () => { const value = pack(); value.snippets.push(structuredClone(value.snippets[0])); expect(() => validatePack(value)).toThrow('snippets[1].id'); value.snippets.pop(); value.snippets[0].parameters[1].id = 'top'; expect(() => validatePack(value)).toThrow('parameters[1].id'); });
    it('reports missing, duplicate, illegal slots and invalid wrap target', () => {
        for (const latex of ['{{missing}}', '{{top}}{{top}}{{bottom}}', '{{bad-id}}']) {
            const value = pack();
            value.snippets[0].latex = latex;
            expect(() => validatePack(value)).toThrow();
        }
        const value = pack();
        value.snippets[0].wrapTarget = 'absent';
        expect(() => validatePack(value)).toThrow('wrapTarget');
    });
    it.each(['\\href{x}{y}', '\\input{secret}', '\\htmlClass{x}{y}', '<img src=x onerror=alert(1)>', '\\newcommand{\\x}{1}'])('rejects active template %s', latex => { const value = pack(); value.snippets[0].latex = latex; expect(() => validatePack(value)).toThrow(); });
    it('bounds bytes, strings, quantities and nesting', () => {
        expect(() => parsePack(' '.repeat(262145))).toThrow('字节');
        expect(() => parsePack('{broken')).toThrow('JSON');
        expect(() => parsePack('['.repeat(30))).toThrow('嵌套');
        const value = pack();
        value.snippets[0].latex = '{'.repeat(34) + 'x' + '}'.repeat(34);
        expect(() => validatePack(value)).toThrow('嵌套');
        value.snippets[0].latex = '{{top}}{{bottom}}';
        value.snippets[0].parameters[0].defaultValue = 'x'.repeat(2049);
        expect(() => validatePack(value)).toThrow();
    });
    it('also bounds the combined template and expanded default nesting', () => { const value = pack(); value.snippets[0].latex = '{'.repeat(20) + '{{top}}+{{bottom}}' + '}'.repeat(20); value.snippets[0].parameters[0].defaultValue = '\\sqrt{'.repeat(20) + 'x' + '}'.repeat(20); expect(() => validatePack(value)).toThrow('latex(defaults)'); });
    it('validates command and alias spelling', () => { for (const command of ['1bad', 'UPPER', 'has-space ', 'with-dash']) {
        const value = pack();
        value.snippets[0].command = command;
        expect(() => validatePack(value)).toThrow('command');
    } const value = pack(); value.snippets[0].aliases = ['bad/path']; expect(() => validatePack(value)).toThrow('aliases'); });
    it('parameter names never read Object.prototype values', () => { const value = pack().snippets[0]; value.latex = '{{constructor}}'; value.parameters = [{ id: 'constructor', name: '参数', description: '', defaultValue: 'x+1' }]; expect(renderSnippet(value)).toBe('x+1'); });
    it('slot expansion preserves TeX control-word boundaries on both sides', () => { const value = pack().snippets[0]; value.latex = '\\sin{{top}}{{bottom}}x'; value.parameters[0].defaultValue = 'A'; value.parameters[1].defaultValue = '\\alpha'; expect(renderSnippet(value)).toBe('\\sin A\\alpha x'); });
    it('removing prompts preserves delimiter and trailing control-word boundaries', () => { expect(stripPrompts('\\left\\lVert\\placeholder[a]{A+B}\\right\\rVert')).toBe('\\left\\lVert A+B\\right\\rVert'); expect(stripPrompts('\\placeholder[a]{\\alpha}x')).toBe('\\alpha x'); });
    it('rejects duplicate pack IDs and reserved built-in replacement', () => { const state = initialPackState(); state.packs.push(structuredClone(state.packs[0])); expect(() => validateState(state)).toThrow('id'); expect(() => replacePack(initialPackState(), { ...pack(), id: 'basic-math' })).toThrow(); });
    it('requires explicit replacement and preserves enabled state', () => { let state = replacePack(initialPackState(), pack()); state.packs.at(-1)!.enabled = false; expect(() => replacePack(state, pack())).toThrow('已存在'); state = replacePack(state, { ...pack(), name: '新名称' }, true); expect(state.packs.at(-1)!.enabled).toBe(false); });
});
describe('Conflicts and transactions', () => {
    it('keeps conflicting candidates with stable built-in priority including local aliases', () => {
        const value = pack();
        value.snippets[0].command = 'sqrt';
        value.snippets[0].aliases = ['ratio'];
        const state = replacePack(initialPackState(), value);
        const aliases = { frac: ['ratio'] };
        expect(commandConflicts(state, aliases).map(c => c.name)).toEqual(['ratio', 'sqrt']);
        const engine = new CompletionEngine(() => registeredSnippets(state));
        engine.aliases = aliases;
        expect(engine.filter('sqrt').candidates.map(s => s.packId)).toEqual(['basic-math', 'test-pack']);
        expect(engine.filter('ratio').candidates[0].id).toBe('frac');
        state.packs.at(-1)!.enabled = false;
        expect(commandConflicts(state, aliases)).toEqual([]);
        expect(engine.filter('sqrt').candidates).toHaveLength(1);
    });
    it('similar prefixes are not exact-name conflicts', () => { const value = pack(); value.snippets[0].command = 'sqrtx'; value.snippets[0].aliases = []; expect(commandConflicts(replacePack(initialPackState(), value))).toEqual([]); });
    it('local aliases use qualified formula identity across packages', () => { const state = replacePack(initialPackState(), pack()); const engine = new CompletionEngine(() => registeredSnippets(state)); engine.aliases = { 'test-pack:ratio': ['customalias'] }; expect(engine.filter('customalias').candidates[0].name).toBe('比值'); });
    it('persists enable state, retains previous state on write failure and detects stale revision', async () => {
        const data = new Map<string, string>();
        let broken = false;
        vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { if (broken)
                throw new Error('disk full'); data.set(key, value); } });
        const service = new FormulaPackService(new LocalPackStorage());
        await service.initialize();
        await service.toggle('linear-algebra', true);
        expect(service.state.revision).toBe(1);
        const restarted = new FormulaPackService(new LocalPackStorage());
        await restarted.initialize();
        expect(restarted.state.packs[1].enabled).toBe(true);
        broken = true;
        const before = structuredClone(service.state);
        await expect(service.toggle('linear-algebra', false)).rejects.toThrow('disk full');
        expect(service.state).toEqual(before);
        broken = false;
        await restarted.toggle('linear-algebra', false);
        await expect(service.toggle('linear-algebra', true)).rejects.toThrow('另一个窗口');
    });
    it('corrupt storage stays untouched and blocks accidental replacement', async () => {
        const write = vi.fn();
        vi.stubGlobal('localStorage', { getItem: () => '{corrupt', setItem: write });
        const service = new FormulaPackService(new LocalPackStorage());
        await service.initialize();
        expect(service.ready).toBe(false);
        await expect(service.install(pack())).rejects.toThrow('未能读取');
        expect(write).not.toHaveBeenCalled();
        expect(PACK_STORAGE_KEY).toContain('.v1');
    });
    it('restores the last good backup while preserving corrupt data separately', async () => {
        const data = new Map<string, string>();
        vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
        const service = new FormulaPackService(new LocalPackStorage());
        await service.initialize();
        await service.toggle('linear-algebra', true);
        await service.toggle('linear-algebra', false);
        data.set(PACK_STORAGE_KEY, '{broken');
        const next = new FormulaPackService(new LocalPackStorage());
        await next.initialize();
        expect(next.ready).toBe(false);
        await next.recover();
        expect(next.ready).toBe(true);
        expect(next.state.packs[1].enabled).toBe(true);
        expect([...data.values()]).toContain('{broken');
    });
});
