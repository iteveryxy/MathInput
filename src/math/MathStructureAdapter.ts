import type { MathfieldElement, Range } from 'mathlive';

export interface OffsetInfo { offset: number; depth: number; latex: string }
export type NodeKind = 'atom' | 'number' | 'operator' | 'script' | 'structure' | 'prompt' | 'fence' | 'function' | 'call';
export interface MathBranch { start: number; end: number; nodes: MathNode[]; owner?: MathNode }
export interface FenceInfo { opening: string; closing: string; content: Range; smart: boolean }
export interface MathNode { kind: NodeKind; latex: string; range: Range; branches: MathBranch[]; parent?: MathBranch; parts?: MathNode[]; fence?: FenceInfo }

const OPERATORS = new Set(['+', '-', '−', '=', '<', '>', '\\le', '\\leq', '\\ge', '\\geq', '\\ne', '\\neq', '\\pm', '\\mp', '\\times', '\\cdot', '/', ',', ';', ':', '\\to', '\\rightarrow', '\\in', '\\approx']);
const FUNCTIONS = new Set(['\\sin', '\\cos', '\\tan', '\\lim', '\\log', '\\ln', '\\exp', '\\sinh', '\\cosh', '\\tanh', '\\arcsin', '\\arccos', '\\arctan']);
const OPEN = new Map([['(', ')'], ['[', ']'], ['\\lbrace', '\\rbrace'], ['\\{', '\\}']]);

function kindOf(latex: string, hasChildren: boolean): NodeKind {
  if (latex.startsWith('\\placeholder')) return 'prompt';
  if (latex.startsWith('^') || latex.startsWith('_')) return 'script';
  if (OPERATORS.has(latex)) return 'operator';
  if (/^[0-9.]+$/.test(latex)) return 'number';
  if (FUNCTIONS.has(latex) || hasChildren && [...FUNCTIONS].some(name => latex.startsWith(`${name}^`) || latex.startsWith(`${name}_`))) return 'function';
  return hasChildren ? 'structure' : 'atom';
}

/** A read-only projection of public getElementInfo() offsets, never MathLive internals.
 * MathLive exposes a post-order sequence. Empty entries delimit editable branches.
 * We retain each branch, so a superscript caret cannot accidentally operate on its base.
 */
export class MathStructureAdapter {
  readonly root: MathBranch;
  constructor(readonly offsets: OffsetInfo[]) {
    this.root = this.readBranches(0, offsets.length - 1)[0] ?? { start: 0, end: 0, nodes: [] };
  }

  static from(field: MathfieldElement): MathStructureAdapter {
    const offsets: OffsetInfo[] = [];
    for (let offset = 0; offset <= field.lastOffset; offset++) {
      const info = field.getElementInfo(offset);
      if (!info || info.depth === undefined) throw new Error('MathLive 未返回可用的数学结构，已停止结构操作');
      offsets.push({ offset, depth: info.depth, latex: info.latex ?? '' });
    }
    return new MathStructureAdapter(offsets);
  }

  private readBranches(start: number, end: number): MathBranch[] {
    if (start > end) return [];
    const depth = this.offsets[start].depth;
    const branches: MathBranch[] = [];
    let branch: MathBranch | undefined;
    let pendingStart = start;
    for (let i = start; i <= end; i++) {
      const info = this.offsets[i];
      if (info.depth !== depth) continue;
      if (info.latex === '') {
        branch = { start: i, end: i, nodes: [] };
        branches.push(branch);
        pendingStart = i + 1;
        continue;
      }
      if (!branch) { branch = { start: Math.max(0, start - 1), end: i, nodes: [] }; branches.push(branch); }
      const children = this.readBranches(pendingStart, i - 1);
      const previous = branch.nodes.at(-1);
      const node: MathNode = { kind: kindOf(info.latex, children.length > 0), latex: info.latex, range: [previous?.range[1] ?? branch.start, i], branches: children, parent: branch };
      // Recognize only a real public child branch with known outer delimiters.
      // A literal string resembling a function or a fence is never enough.
      if (children.length === 1) {
        const text = info.latex.startsWith('\\left') ? info.latex.slice(5) : info.latex;
        for (const [opening, closing] of OPEN) {
          const suffix = info.latex.startsWith('\\left') ? `\\right${closing}` : closing;
          if (text.startsWith(opening) && text.endsWith(suffix)) {
            node.kind = 'fence';
            node.fence = { opening, closing, content: [children[0].start, children[0].end], smart: true };
            break;
          }
        }
      }
      children.forEach((child) => { child.owner = node; });
      branch.nodes.push(node);
      branch.end = i;
      pendingStart = i + 1;
    }
    for (const current of branches) this.group(current);
    return branches;
  }

  private group(branch: MathBranch): void {
    const result: MathNode[] = [];
    for (const node of branch.nodes) {
      const previous = result.at(-1);
      if (node.kind === 'script' && previous && previous.kind !== 'operator') {
        result.pop();
        const combined: MathNode = { kind: 'structure', latex: previous.latex + node.latex, range: [previous.range[0], node.range[1]], branches: [...previous.branches, ...node.branches], parts: [previous, node], parent: branch };
        combined.branches.forEach((child) => { child.owner = combined; });
        result.push(combined);
      } else if (node.kind === 'number' && previous?.kind === 'number') {
        previous.latex += node.latex;
        previous.range[1] = node.range[1];
      } else result.push(node);
    }
    // Literal fences complement the structural projection (smart fences already have children).
    const fenced: MathNode[] = [];
    const stack: { index: number; closing: string }[] = [];
    for (const node of result) {
      if (OPEN.has(node.latex)) stack.push({ index: fenced.length, closing: OPEN.get(node.latex)! });
      const top = stack.at(-1);
      if (top && node.latex === top.closing) {
        stack.pop();
        const open = fenced[top.index];
        const inside = fenced.splice(top.index + 1);
        fenced.pop();
        const child: MathBranch = { start: open.range[1], end: node.range[0], nodes: inside };
        const fence: MathNode = { kind: 'fence', latex: open.latex + inside.map((n) => n.latex).join('') + node.latex, range: [open.range[0], node.range[1]], branches: [child], fence: { opening: open.latex, closing: node.latex, content: [child.start, child.end], smart: false }, parent: branch };
        child.owner = fence;
        inside.forEach((n) => { n.parent = child; });
        fenced.push(fence);
      } else fenced.push(node);
    }
    const calls: MathNode[] = [];
    for (const node of fenced) {
      const name = calls.at(-1);
      const isFunction = (n: MathNode): boolean => n.kind === 'function' || !!n.parts && isFunction(n.parts[0]);
      if (name && isFunction(name) && node.kind === 'fence') {
        calls.pop();
        const call: MathNode = { kind: 'call', latex: name.latex + node.latex, range: [name.range[0], node.range[1]], branches: [...name.branches, ...node.branches], parts: [name, node], parent: branch };
        call.branches.forEach((child) => { child.owner = call; });
        calls.push(call);
      } else calls.push(node);
    }
    branch.nodes = calls;
  }

  branchAt(position: number, branch = this.root): MathBranch {
    for (const node of branch.nodes) {
      for (const child of node.branches) {
        if (position >= child.start && position <= child.end) return this.branchAt(position, child);
      }
    }
    return branch;
  }

  containingNodes(start: number, end: number): MathNode[] {
    return this.allNodes().filter((node) => node.range[0] <= start && node.range[1] >= end)
      .sort((a, b) => a.range[1] - a.range[0] - (b.range[1] - b.range[0]));
  }

  allNodes(): MathNode[] {
    const result = new Set<MathNode>();
    const visit = (node: MathNode) => {
      if (result.has(node)) return;
      result.add(node); node.parts?.forEach(visit);
      node.branches.forEach((child) => child.nodes.forEach(visit));
    };
    this.root.nodes.forEach(visit);
    return [...result];
  }
}
