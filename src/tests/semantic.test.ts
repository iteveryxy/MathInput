import { describe, expect, it } from 'vitest';
import { MathStructureAdapter, type OffsetInfo } from '../math/MathStructureAdapter';
import { SemanticEditing } from '../math/SemanticEditing';
import { MathNodeNavigator } from '../math/MathNodeNavigator';

const projection = (entries: [number, string][]) => new MathStructureAdapter(entries.map(([depth, latex], offset): OffsetInfo => ({ offset, depth, latex })));
const flat = (text: string) => projection([[0, ''], ...Array.from(text, (char): [number, string] => [0, char])]);
const call = () => projection([[0, ''], [0, 'a'], [0, '+'], [0, '\\sin'], [1, ''], [1, 'x'], [0, '\\left(x\\right)'], [0, '+'], [0, 'b']]);

describe('v0.2 数学语义操作计划', () => {
  it('函数调用与参数有稳定独立范围', () => {
    const tree = call();
    expect(tree.root.nodes.map(n => [n.kind, n.range])).toEqual([['atom', [0, 1]], ['operator', [1, 2]], ['call', [2, 6]], ['operator', [6, 7]], ['atom', [7, 8]]]);
    expect(new SemanticEditing(tree).functionName(3, -1)).toEqual([2, 3]);
    expect(new MathNodeNavigator(tree).expansion([6, 6], -1)).toEqual([2, 6]);
    expect(new MathNodeNavigator(tree).expansion([2, 2], 1)).toEqual([2, 6]);
    expect(new MathNodeNavigator(tree).leftTerm(5)).toEqual([4, 5]);
  });
  it('普通 sinValue 和 sin 字母不会被升级为函数名', () => {
    for (const text of ['sinValue', 'sin']) for (let offset = 0; offset <= text.length; offset++) expect(new SemanticEditing(flat(text)).functionName(offset, -1)).toBeUndefined();
  });
  it('函数解除只保留完整参数，分式解除禁用', () => {
    expect(new SemanticEditing(call()).unwrap([2, 6])?.content).toEqual([4, 5]);
    const fraction = projection([[0, ''], [1, ''], [1, 'x'], [1, ''], [1, 'y'], [0, '\\frac{x}{y}']]);
    expect(new SemanticEditing(fraction).unwrap([0, 5])).toBeUndefined();
  });
  it('嵌套括号按配对关系跳转；未配对安全无操作', () => {
    const semantic = new SemanticEditing(flat('(a+(b+c))'));
    expect(semantic.matchingFence(4)).toBe(8);
    expect(semantic.matchingFence(8)).toBe(3);
    expect(semantic.matchingFence(0)).toBe(9);
    expect(new SemanticEditing(flat('(a+b')).matchingFence(0)).toBeUndefined();
    expect(semantic.matchingFence(2)).toBeUndefined();
  });
  it('智能括号的单侧删除计划区分外壳与内部内容', () => {
    const semantic = new SemanticEditing(projection([[0, ''], [1, ''], [1, 'a'], [1, '+'], [1, 'b'], [0, '\\left(a+b\\right)']]));
    expect(semantic.singleFence(5, -1)?.remove).toBe('closing');
    expect(semantic.singleFence(0, 1)?.remove).toBe('opening');
    expect(semantic.singleFence(3, -1)).toBeUndefined();
    expect(semantic.unwrap([0, 5])?.content).toEqual([1, 4]);
  });
  it('保留幂底数范围，逐级到幂、乘法项和分支', () => {
    const tree = projection([[0, ''], [0, '2'], [0, 'x'], [1, ''], [1, '2'], [0, '^2'], [0, '+'], [0, '3'], [0, 'y']]);
    const nav = new MathNodeNavigator(tree);
    expect(nav.expansion([2, 2], -1)).toEqual([1, 2]);
    expect(nav.expansion([1, 2], -1)).toEqual([1, 5]);
    expect(nav.expansion([1, 5], -1)).toEqual([0, 5]);
    expect(nav.expansion([0, 5], -1)).toEqual([0, 8]);
    expect(new SemanticEditing(tree).adjacentTerm(5, -1)).toEqual([0, 5]);
    expect(new SemanticEditing(tree).adjacentTerm(6, 1)).toEqual([6, 8]);
  });
});
