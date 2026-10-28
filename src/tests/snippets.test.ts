import { describe, it, expect } from 'vitest';
import { SnippetRegistry, renderSnippet } from '../snippets/SnippetRegistry';
import { SnippetSessionStack, type SnippetSession } from '../snippets/SnippetSession';
import { stripPrompts } from '../output/LatexExporter';
import { formatMath } from '../output/MarkdownFormatter';

describe('声明式模板', () => {
  const registry = new SnippetRegistry();
  it('所有模板默认值均为实际数学内容', () => {
    for (const snippet of registry.all()) { const value = renderSnippet(snippet); expect(value).not.toContain('{{'); expect(value).not.toContain('placeholder'); expect(value.length).toBeGreaterThan(0); }
  });
  it('sum 有四个独立默认参数且可替换终点', () => {
    const sum = registry.get('sum')!;
    expect(sum.parameters.map((p) => p.defaultValue)).toEqual(['i', 'k', 'k+t', 'x_i']);
    expect(renderSnippet(sum, { end: 'n' })).toContain('^{ n }');
  });
  it('拒绝不存在的参数和包裹目标', () => {
    const sqrt = registry.get('sqrt')!;
    expect(() => registry.register({ ...sqrt, latex: '{{missing}}' })).toThrow();
    expect(() => registry.register({ ...sqrt, wrapTarget: 'missing' })).toThrow();
  });
});

describe('J: 可恢复的嵌套会话栈', () => {
  const registry = new SnippetRegistry();
  const session = (id: string, command: string): SnippetSession => { const snippet = registry.get(command)!; return { id, anchor: id, snippet, promptIds: snippet.parameters.map((p) => `${id}-${p.id}`), index: 0 }; };
  it('frac → sqrt → frac 完成后回到原父参数', () => {
    const stack = new SnippetSessionStack(); stack.push(session('outer', 'frac')); stack.push(session('root', 'sqrt')); stack.push(session('inner', 'frac'));
    expect(stack.depth).toBe(3); expect(stack.next()).toBe('next'); expect(stack.current?.index).toBe(1);
    expect(stack.next()).toBe('finished'); stack.pop(); expect(stack.current?.id).toBe('root'); stack.pop(); expect(stack.current?.id).toBe('outer'); expect(stack.current?.index).toBe(0); expect(stack.next()).toBe('next'); expect(stack.current?.index).toBe(1);
  });
  it('B: Enter 提前弹出当前会话，不推进父级', () => {
    const stack = new SnippetSessionStack(); stack.push(session('outer', 'frac')); stack.push(session('sum', 'sum')); stack.pop(); expect(stack.current?.index).toBe(0);
  });
  it('撤销时可恢复快照，删除父锚点会清理所有内层状态', () => {
    const stack = new SnippetSessionStack(); stack.push(session('outer', 'frac')); stack.push(session('inner', 'sqrt')); const snapshot = stack.snapshot(); stack.pop(); stack.restore(snapshot); expect(stack.depth).toBe(2); stack.reconcile(['inner']); expect(stack.depth).toBe(0); expect(snapshot).toHaveLength(2);
  });
});

describe('导出数学内容，不留下编辑元数据', () => {
  it.each([
    ['\\placeholder[a]{k+t}', 'k+t'],
    ['\\placeholder[outer]{\\frac{\\placeholder[x]{\\sqrt{a+b}}}{y}}', '\\frac{\\sqrt{a+b}}{y}'],
    ['\\frac{\\placeholder[a]{x^2}}{\\placeholder[b]{n}}', '\\frac{x^2}{n}'],
    ['\\text{\\{literal\\}}+\\alpha', '\\text{\\{literal\\}}+\\alpha'],
  ])('正确处理嵌套组 %s', (input, expected) => { expect(stripPrompts(input)).toBe(expected); });
  it('损坏的占位符拒绝导出', () => { expect(() => stripPrompts('\\placeholder[a]{x')).toThrow(); });
  it('三种输出模式与空输入', () => {
    expect(formatMath('\\frac{x}{y}', 'inline')).toBe('$\\frac{x}{y}$'); expect(formatMath('x', 'block')).toBe('$$\nx\n$$'); expect(formatMath('x', 'latex')).toBe('x'); expect(() => formatMath(' ', 'inline')).toThrow();
  });
});
