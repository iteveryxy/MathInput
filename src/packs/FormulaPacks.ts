import { BUILTIN_SNIPPETS } from '../snippets/BuiltinSnippets';
import type { Snippet } from '../snippets/types';
import type { CustomAliases } from '../completion/AliasResolver';
import { BASE_PACK_ID, MY_PACK_ID, snippetKey, type FormulaPack, type PackState } from './types';
import sample from './examples/linear-algebra.mathpack.json';
import calculus from './university/advanced-math.mathpack.json';
import linearAlgebra from './university/university-linear-algebra.mathpack.json';
import notation from './university/math-notation.mathpack.json';
import { validatePack, validateState } from './Validation';
export const BASE_PACK: FormulaPack = { schemaVersion: 1, id: BASE_PACK_ID, name: '基础数学', version: '0.3.0', author: 'Math Input', description: '内置基础模板；沿用 v0.1/v0.2 编辑与参数机制', snippets: BUILTIN_SNIPPETS };
export const UNIVERSITY_PACKS = [calculus, linearAlgebra, notation].map(pack => validatePack(pack));
export function initialPackState(): PackState {
    const bundled = [validatePack(sample), ...structuredClone(UNIVERSITY_PACKS)];
    return { schemaVersion: 1, revision: 0, baseEnabled: true, packs: [{ enabled: true, pack: { schemaVersion: 1, id: MY_PACK_ID, name: '我的公式', version: '1.0.0', author: '', description: '保存在本机的自定义公式', snippets: [] } }, ...bundled.map(pack => ({ enabled: false, pack }))] };
}
export function packEntries(state: PackState) { return [{ enabled: state.baseEnabled, pack: BASE_PACK, builtin: true }, ...state.packs.map(entry => ({ ...entry, builtin: false }))]; }
export function registeredSnippets(state: PackState, includeDisabled = false): Snippet[] {
    const entries = packEntries(state).filter(entry => includeDisabled || entry.enabled);
    entries.sort((a, b) => (a.builtin ? -2 : a.pack.id === MY_PACK_ID ? -1 : 0) - (b.builtin ? -2 : b.pack.id === MY_PACK_ID ? -1 : 0) || a.pack.id.localeCompare(b.pack.id, 'en-US'));
    return entries.flatMap(entry => entry.pack.snippets.map(snippet => ({ ...structuredClone(snippet), packId: entry.pack.id, packName: entry.pack.name })));
}
export interface CommandConflict {
    name: string;
    sources: {
        key: string;
        packId: string;
        packName: string;
        formula: string;
        kind: string;
    }[];
}
export function commandConflicts(state: PackState, aliases: CustomAliases = {}): CommandConflict[] {
    const names = new Map<string, CommandConflict['sources']>();
    for (const snippet of registeredSnippets(state)) {
        for (const [name, kind] of [[snippet.command, '命令'], ...snippet.aliases.map(alias => [alias, '别名']), ...(aliases[snippetKey(snippet)] ?? []).map(alias => [alias, '本机别名'])]) {
            const key = name.toLowerCase();
            const sources = names.get(key) ?? [];
            if (!sources.some(source => source.key === snippetKey(snippet)))
                sources.push({ key: snippetKey(snippet), packId: snippet.packId!, packName: snippet.packName!, formula: snippet.name, kind });
            names.set(key, sources);
        }
    }
    return [...names].filter(([, sources]) => sources.length > 1).map(([name, sources]) => ({ name, sources })).sort((a, b) => a.name.localeCompare(b.name, 'en-US'));
}
export function replacePack(state: PackState, pack: FormulaPack, replace = false): PackState {
    const next = structuredClone(state);
    const index = next.packs.findIndex(entry => entry.pack.id === pack.id);
    if (pack.id === BASE_PACK_ID)
        throw new Error('基础数学包不可替换；请更换导入包的 ID');
    if (index >= 0 && !replace)
        throw new Error(`公式包 ID ${pack.id} 已存在，请明确选择替换或修改 ID`);
    if (index >= 0)
        next.packs[index].pack = pack;
    else
        next.packs.push({ pack, enabled: true });
    return validateState(next);
}
