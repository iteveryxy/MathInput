import type { MathNode } from './MathStructureAdapter';
import { MathStructureAdapter } from './MathStructureAdapter';
import { termAt } from './ImplicitMultiplication';
import type { Range } from 'mathlive';

/** Read-only operation plans. Mutation remains in MathEditor via public APIs. */
export class SemanticEditing {
  constructor(readonly structure: MathStructureAdapter) {}

  adjacentTerm(position: number, direction: -1 | 1): Range | undefined {
    return termAt(this.structure.branchAt(position), position, direction);
  }

  functionName(position: number, direction: -1 | 1): Range | undefined {
    return this.structure.allNodes().find((node) => node.kind === 'function' && node.range[direction < 0 ? 1 : 0] === position)?.range;
  }

  matchingFence(position: number): number | undefined {
    const candidates = this.structure.allNodes().filter((node) => node.fence &&
      [node.range[0], node.range[1], ...node.fence.content].includes(position))
      .sort((a, b) => a.range[1] - a.range[0] - (b.range[1] - b.range[0]));
    const node = candidates[0];
    if (!node?.fence) return undefined;
    return position === node.range[0] || position === node.fence.content[0] ? node.range[1] : node.range[0];
  }

  unwrap(range: Range): { node: MathNode; content: Range } | undefined {
    const collapsed = range[0] === range[1];
    const candidates = this.structure.containingNodes(...range).filter((node) => node.kind !== 'prompt' &&
      (collapsed || node.range[0] === range[0] && node.range[1] === range[1]));
    // Prefer the enclosing call over its argument fence at the same outer edge.
    let node = candidates.find((n) => n.kind === 'call' && (n.range[0] === range[0] || n.range[1] === range[1])) ?? candidates[0];
    if (collapsed) {
      const branch = this.structure.branchAt(range[0]);
      if (branch.owner && range[0] !== node?.range[0] && range[0] !== node?.range[1]) node = branch.owner;
    }
    if (!node) return undefined;
    if (node.kind === 'call' && node.parts?.[0].kind === 'function' && node.parts[0].branches.length === 0) {
      const fence = node.parts[1];
      if (fence?.fence) return { node, content: fence.fence.content };
    }
    if (node.fence) return { node, content: node.fence.content };
    // Indexed radicals and multi-branch fractions have no unambiguous unwrap.
    if (node.latex.startsWith('\\sqrt{') && node.branches.length === 1) return { node, content: [node.branches[0].start, node.branches[0].end] };
    return undefined;
  }

  singleFence(position: number, direction: -1 | 1): { node: MathNode; remove: 'opening' | 'closing' } | undefined {
    for (const node of this.structure.allNodes()) {
      const fence = node.fence;
      if (!fence?.smart) continue;
      if (direction < 0 && position === node.range[1] || direction > 0 && position === fence.content[1]) return { node, remove: 'closing' };
      if (direction > 0 && position === node.range[0] || direction < 0 && position === fence.content[0]) return { node, remove: 'opening' };
    }
    return undefined;
  }
}
