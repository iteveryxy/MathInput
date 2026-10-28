import { describe, it, expect } from 'vitest';
import { CompletionEngine } from '../completion/CompletionEngine';
import { parseAliases } from '../completion/AliasResolver';
import { SnippetRegistry } from '../snippets/SnippetRegistry';
import { dispatchEnter } from '../editor/EditorState';

describe('独立补全引擎', () => {
  const registry = new SnippetRegistry();
  const create = () => new CompletionEngine(() => registry.all());
  it('A: 方向键改变候选后继续筛选 sq', () => {
    const engine = create();
    expect(engine.filter('s').candidates.map((item) => item.id)).toEqual(['sqrt', 'sum', 'sin']);
    engine.move(1); expect(engine.selected?.id).toBe('sum');
    engine.filter('sq'); expect(engine.selected?.id).toBe('sqrt'); expect(engine.state.index).toBe(0);
  });
  it.each([['gh', 'sqrt'], ['fenshu', 'frac'], ['qh', 'sum'], ['jifen', 'int'], ['zx', 'sin'], ['pai', 'pi'], [' SQRT ', 'sqrt']])('别名 %s 匹配 %s', (query, id) => { expect(create().filter(query).candidates[0]?.id).toBe(id); });
  it('上下方向循环且关闭后保留可恢复状态', () => {
    const engine = create(); engine.filter('s'); engine.move(-1); expect(engine.selected?.id).toBe('sin'); engine.move(1); expect(engine.selected?.id).toBe('sqrt'); engine.close(); expect(engine.state.open).toBe(false);
  });
  it('空查询默认关闭，显式命令面板显示全部', () => {
    const engine = create(); expect(engine.filter('').open).toBe(false); expect(engine.filter('', true).candidates.length).toBe(13); expect(engine.filter('notacommand').open).toBe(false);
  });
  it('自定义别名立即参与筛选', () => {
    const engine = create(); engine.aliases = parseAliases('sqrt=kg,pfg\nfrac=fen', ['sqrt', 'frac']); expect(engine.filter('kg').candidates[0].id).toBe('sqrt');
  });
  it.each(['missing=x', 'sqrt=', 'sqrt=x=y', 'sqrt=中文'])('无效配置拒绝写入：%s', (line) => { expect(() => parseAliases(line, ['sqrt'])).toThrow(); });
});

describe('Enter 状态优先级与 IME', () => {
  it.each([
    [{ composing: true, completion: true, snippet: true }, true, 'ime'],
    [{ composing: false, completion: true, snippet: true }, false, 'accept-completion'],
    [{ composing: false, completion: true, snippet: true }, true, 'wrap-completion'],
    [{ composing: false, completion: false, snippet: true }, false, 'finish-snippet'],
    [{ composing: false, completion: false, snippet: false }, false, 'submit'],
  ] as const)('按状态分发 %#', (context, shift, expected) => { expect(dispatchEnter(context, shift)).toBe(expected); });
});
