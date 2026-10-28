import type { Range } from 'mathlive';
import { MathStructureAdapter } from './MathStructureAdapter';
import { termAt } from './ImplicitMultiplication';

export class MathNodeNavigator {
  constructor(readonly structure: MathStructureAdapter) {}
  leftTerm(position: number): Range | undefined { return termAt(this.structure.branchAt(position), position, -1); }
  move(position: number, direction: -1 | 1): number {
    const branch = this.structure.branchAt(position);
    const range = termAt(branch, position, direction);
    return range ? direction < 0 ? range[0] : range[1] : position;
  }
  exit(position: number, direction: -1 | 1): number {
    let owner = this.structure.branchAt(position).owner;
    while (owner?.kind === 'prompt') owner = owner.parent?.owner;
    return owner ? owner.range[direction < 0 ? 0 : 1] : position;
  }
  expansion(range: Range, direction: -1 | 1 = -1): Range | undefined {
    const [start, end] = range;
    const branch = this.structure.branchAt(start === end ? end : start + 0.01);
    if (start === end) {
      const adjacent = direction < 0
        ? [...branch.nodes].reverse().find((node) => node.range[0] < start && node.range[1] >= start)
        : branch.nodes.find((node) => node.range[0] <= end && node.range[1] > end);
      if (adjacent && adjacent.kind !== 'prompt') {
        if (adjacent.range[0] < start && adjacent.range[1] > end) {
          const part = this.structure.containingNodes(start, end).find((node) => node !== adjacent && node.kind !== 'script' && node.kind !== 'prompt' && node.range[0] >= adjacent.range[0] && node.range[1] <= adjacent.range[1]);
          if (part) return [...part.range];
        }
        return [...adjacent.range];
      }
    }
    const atom = branch.nodes.find((node) => node.range[0] <= start && node.range[1] >= end && (node.range[0] < start || node.range[1] > end));
    if (atom && atom.kind !== 'prompt') return [...atom.range];
    const term = termAt(branch, end, -1) ?? termAt(branch, start, 1);
    if (term && term[0] <= start && term[1] >= end && (term[0] < start || term[1] > end)) return term;
    if (branch.start < start || branch.end > end) return [branch.start, branch.end];
    return this.structure.containingNodes(start, end).find((node) => node.kind !== 'prompt' && (node.range[0] < start || node.range[1] > end))?.range;
  }
}
