import type { Snippet } from '../snippets/types';
import type { FormulaPack, PackState } from './types';
import { BASE_PACK_ID, PACK_LIMITS } from './types';
import { renderSnippet } from '../snippets/SnippetRegistry';
import { t, tr } from '../platform/Language';
export class PackValidationError extends Error {
    constructor(readonly path: string, message: string) { super(`${path}: ${t(message)}`); }
}
const fail = (path: string, message: string): never => { throw new PackValidationError(path, message); };
const idPattern = /^[a-z][a-z0-9-]{0,63}$/;
const commandPattern = /^[a-z][a-z0-9]{0,39}$/;
const parameterPattern = /^[a-z][a-z0-9_]{0,31}$/;
const forbidden = new Set(['href', 'url', 'htmlclass', 'htmlid', 'htmldata', 'htmlstyle', 'class', 'cssid', 'style', 'includegraphics', 'input', 'include', 'def', 'gdef', 'edef', 'xdef', 'newcommand', 'renewcommand', 'providecommand', 'let', 'catcode', 'csname', 'endcsname', 'require', 'usepackage', 'write', 'openout', 'read', 'special', 'placeholder', 'prompt', 'unicode', 'tooltip', 'mathtip', 'texttip', 'color', 'textcolor', 'colorbox', 'fcolorbox', 'bbox', 'enclose']);
function object(value: unknown, path: string, allowed: string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return fail(path, '需要 JSON 对象');
    for (const key of Object.keys(value))
        if (!allowed.includes(key))
            fail(`${path}.${key}`, '不支持的字段；请使用受支持的 Schema，不能静默丢弃字段');
    return value as Record<string, unknown>;
}
function text(value: unknown, path: string, max: number, empty = false): string {
    if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))
        return fail(path, tr(`需要${empty ? '' : '非空'}文本，最多 ${max} 字符`, `Expected ${empty ? 'text' : 'nonempty text'} of at most ${max} characters.`));
    return value;
}
function array(value: unknown, path: string, max: number): unknown[] {
    if (!Array.isArray(value) || value.length > max)
        return fail(path, tr(`需要数组，最多 ${max} 项`, `Expected an array of at most ${max} items.`));
    return value;
}
export function validateLatexData(value: string, path: string, slots = false): void {
    text(value, path, PACK_LIMITS.latex, true);
    if (/<\/?[a-z!][^>]*>/i.test(value))
        fail(path, '不允许 HTML 标签');
    for (const match of value.matchAll(/\\([a-zA-Z]+)/g))
        if (forbidden.has(match[1].toLowerCase()))
            fail(path, tr(`不允许命令 \\${match[1]}`, `Command \\${match[1]} is not allowed.`));
    let depth = 0;
    for (let i = 0; i < value.length; i++) {
        if (value[i] === '\\' && ['{', '}', '\\'].includes(value[i + 1])) {
            i++;
            continue;
        }
        if (value[i] === '{') {
            if (++depth > PACK_LIMITS.nesting)
                fail(path, 'LaTeX 嵌套过深');
        }
        if (value[i] === '}' && --depth < 0)
            fail(path, 'LaTeX 花括号不匹配');
    }
    if (depth !== 0)
        fail(path, 'LaTeX 花括号不匹配');
    const environments: string[] = [];
    for (const match of value.matchAll(/\\(begin|end)\{([^{}]+)\}/g)) {
        if (match[1] === 'begin')
            environments.push(match[2]);
        else if (environments.pop() !== match[2])
            fail(path, 'LaTeX 环境不匹配');
    }
    if (environments.length)
        fail(path, 'LaTeX 环境未结束');
    if (!slots && /\{\{[a-zA-Z_][\w-]*\}\}/.test(value))
        fail(path, '默认值不能再声明参数槽位');
}
export function validatePack(value: unknown, path = '$'): FormulaPack {
    const pack = object(value, path, ['schemaVersion', 'id', 'name', 'version', 'author', 'description', 'snippets']);
    if (pack.schemaVersion !== 1)
        fail(`${path}.schemaVersion`, '仅支持版本 1，未来版本需要显式迁移');
    if (!idPattern.test(text(pack.id, `${path}.id`, 64)))
        fail(`${path}.id`, '须为小写英文字母开头的字母、数字或短横线；不能含路径字符');
    if (!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(text(pack.version, `${path}.version`, 24)))
        fail(`${path}.version`, '使用 major.minor.patch 版本号');
    text(pack.name, `${path}.name`, 80);
    text(pack.author, `${path}.author`, 120, true);
    text(pack.description, `${path}.description`, 1000, true);
    const ids = new Set<string>();
    const snippets = array(pack.snippets, `${path}.snippets`, PACK_LIMITS.snippets);
    snippets.forEach((raw, index) => {
        const p = `${path}.snippets[${index}]`;
        const snippet = object(raw, p, ['id', 'command', 'aliases', 'name', 'description', 'latex', 'parameters', 'wrapTarget', 'preferSelection']);
        const id = text(snippet.id, `${p}.id`, 64);
        if (!idPattern.test(id) || ids.has(id))
            fail(`${p}.id`, '非法或重复的公式 ID');
        ids.add(id);
        if (!commandPattern.test(text(snippet.command, `${p}.command`, 40)))
            fail(`${p}.command`, '命令须为小写字母开头，只能包含字母、数字');
        const aliases = array(snippet.aliases, `${p}.aliases`, 24).map((v, i) => text(v, `${p}.aliases[${i}]`, 40));
        if (aliases.some(v => !commandPattern.test(v)) || new Set(aliases).size !== aliases.length)
            fail(`${p}.aliases`, '别名非法或重复');
        text(snippet.name, `${p}.name`, 80);
        text(snippet.description, `${p}.description`, 1000, true);
        const latex = text(snippet.latex, `${p}.latex`, PACK_LIMITS.latex);
        validateLatexData(latex, `${p}.latex`, true);
        const parameters = array(snippet.parameters, `${p}.parameters`, PACK_LIMITS.parameters);
        const parameterIds = new Set<string>();
        parameters.forEach((rawParameter, i) => {
            const pp = `${p}.parameters[${i}]`;
            const parameter = object(rawParameter, pp, ['id', 'name', 'description', 'defaultValue']);
            const parameterId = text(parameter.id, `${pp}.id`, 32);
            if (!parameterPattern.test(parameterId) || parameterIds.has(parameterId))
                fail(`${pp}.id`, '非法或重复的参数 ID');
            parameterIds.add(parameterId);
            text(parameter.name, `${pp}.name`, 80);
            text(parameter.description, `${pp}.description`, 500, true);
            validateLatexData(text(parameter.defaultValue, `${pp}.defaultValue`, 2048), `${pp}.defaultValue`);
        });
        const matches = [...latex.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)];
        for (const match of matches)
            if (!parameterIds.has(match[1]))
                fail(`${p}.latex`, tr(`槽位 ${match[1]} 缺少参数声明`, `Slot ${match[1]} has no parameter declaration.`));
        for (const parameter of parameterIds)
            if (matches.filter(match => match[1] === parameter).length !== 1)
                fail(`${p}.parameters`, tr(`参数 ${parameter} 必须恰好对应一个槽位`, `Parameter ${parameter} must match exactly one slot.`));
        if (/\{\{\s*[a-zA-Z_][^{}]*\}\}/.test(latex.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, '')))
            fail(`${p}.latex`, '非法槽位；使用 {{parameter_id}}');
        if (snippet.wrapTarget !== undefined && !parameterIds.has(text(snippet.wrapTarget, `${p}.wrapTarget`, 32)))
            fail(`${p}.wrapTarget`, '包裹目标必须是已声明参数');
        if (snippet.preferSelection !== undefined && typeof snippet.preferSelection !== 'boolean')
            fail(`${p}.preferSelection`, '须为布尔值');
        validateLatexData(renderSnippet(snippet as unknown as Snippet), `${p}.latex(defaults)`);
    });
    if (new TextEncoder().encode(JSON.stringify(value)).length > PACK_LIMITS.fileBytes)
        fail(path, '公式包超过 256 KiB 上限');
    return structuredClone(value) as FormulaPack;
}
export function parsePack(raw: string): FormulaPack {
    if (new TextEncoder().encode(raw).length > PACK_LIMITS.fileBytes)
        fail('$', tr(`文件不得超过 ${PACK_LIMITS.fileBytes} 字节`, `The file must not exceed ${PACK_LIMITS.fileBytes} bytes.`));
    let depth = 0, quoted = false, escaped = false;
    for (const ch of raw) {
        if (quoted) {
            if (escaped)
                escaped = false;
            else if (ch === '\\')
                escaped = true;
            else if (ch === '"')
                quoted = false;
        }
        else if (ch === '"')
            quoted = true;
        else if (ch === '{' || ch === '[') {
            if (++depth > 16)
                fail('$', 'JSON 嵌套过深');
        }
        else if (ch === '}' || ch === ']')
            depth--;
    }
    let value: unknown;
    try {
        value = JSON.parse(raw.replace(/^\uFEFF/, ''));
    }
    catch {
        return fail('$', 'JSON 语法错误');
    }
    return validatePack(value);
}
export function validateState(value: unknown): PackState {
    const state = object(value, '$', ['schemaVersion', 'revision', 'baseEnabled', 'packs']);
    if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || (state.revision as number) < 0 || typeof state.baseEnabled !== 'boolean')
        fail('$', '不支持的存储版本或无效修订号');
    const ids = new Set<string>();
    array(state.packs, '$.packs', PACK_LIMITS.packs).forEach((value, index) => {
        const entry = object(value, `$.packs[${index}]`, ['enabled', 'pack']);
        if (typeof entry.enabled !== 'boolean')
            fail(`$.packs[${index}].enabled`, '须为布尔值');
        const pack = validatePack(entry.pack, `$.packs[${index}].pack`);
        if (pack.id === BASE_PACK_ID || ids.has(pack.id))
            fail(`$.packs[${index}].pack.id`, '公式包 ID 已存在或被内置包保留');
        ids.add(pack.id);
    });
    if (new TextEncoder().encode(JSON.stringify(value)).length > PACK_LIMITS.stateBytes)
        fail('$', '本地公式库超过大小上限');
    return structuredClone(value) as PackState;
}
export function standaloneSnippet(snippet: Snippet): Snippet {
    const { packId: _packId, packName: _packName, ...data } = snippet;
    return data;
}
