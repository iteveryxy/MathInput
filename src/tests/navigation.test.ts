import { describe, it, expect } from 'vitest';
import { MathStructureAdapter, type OffsetInfo } from '../math/MathStructureAdapter';
import { MathNodeNavigator } from '../math/MathNodeNavigator';

// Offsets from the real MathLive 0.110.0 probe: a+\frac{x^2+y}{a+b}.
const fraction: OffsetInfo[] = [[0, ''], [0, 'a'], [0, '+'], [1, ''], [1, 'x'], [2, ''], [2, '2'], [1, '^2'], [1, '+'], [1, 'y'], [1, ''], [1, 'a'], [1, '+'], [1, 'b'], [0, '\\frac{x^2+y}{a+b}']].map(([depth, latex], offset) => ({ offset, depth: depth as number, latex: latex as string }));
const flat = (text: string) => new MathStructureAdapter([{ offset: 0, depth: 0, latex: '' }, ...Array.from(text, (latex, i) => ({ offset: i + 1, depth: 0, latex }))]);

describe('语法层级与数学项', () => {
  it('I: Ctrl Right 在分子内跳过完整 x²，到 + 前', () => { const nav = new MathNodeNavigator(new MathStructureAdapter(fraction)); expect(nav.move(3, 1)).toBe(7); expect(nav.move(7, -1)).toBe(3); expect(nav.move(7, 1)).toBe(8); });
  it('G: 指数外部与内部使用不同层级', () => { const nav = new MathNodeNavigator(new MathStructureAdapter(fraction)); expect(nav.leftTerm(7)).toEqual([3, 7]); expect(nav.leftTerm(6)).toEqual([5, 6]); });
  it('I: 从分子跳出一层分式，而非跳到指数', () => { const nav = new MathNodeNavigator(new MathStructureAdapter(fraction)); expect(nav.exit(7, 1)).toBe(14); expect(nav.exit(7, -1)).toBe(2); expect(nav.exit(6, 1)).toBe(7); });
  it.each([['a+b', [2, 3]], ['abc', [0, 3]], ['2x', [0, 2]], ['23', [0, 2]], ['a-2x', [2, 4]], ['(a+b)', [0, 5]], ['(a+b)(c+d)', [0, 10]]])('稳定包裹 %s', (text, expected) => { const nav = new MathNodeNavigator(flat(text as string)); expect(nav.leftTerm((text as string).length)).toEqual(expected); });
  it('连续数字形成数字节点，2x 保留为不同因子', () => { expect(flat('23').root.nodes.map((n) => n.kind)).toEqual(['number']); expect(flat('2x').root.nodes.map((n) => n.kind)).toEqual(['number', 'atom']); });
  it('光标位于多位数内部时，左侧包裹不吞掉右侧数字', () => { const nav = new MathNodeNavigator(flat('23x')); expect(nav.leftTerm(1)).toEqual([0, 1]); expect(nav.move(1, -1)).toBe(0); expect(nav.move(1, 1)).toBe(3); });
  it('扩展选区先完整幂、再分子、再分式', () => { const nav = new MathNodeNavigator(new MathStructureAdapter(fraction)); expect(nav.expansion([7, 7])).toEqual([3, 7]); expect(nav.expansion([3, 7])).toEqual([3, 9]); expect(nav.expansion([3, 9])).toEqual([2, 14]); });
});
