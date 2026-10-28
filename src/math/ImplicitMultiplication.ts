import type { MathBranch, MathNode } from './MathStructureAdapter';
import type { Range } from 'mathlive';

/** Group factors for navigation only; this never rewrites the entered mathematics. */
export function termAt(branch: MathBranch, position: number, direction: -1 | 1): Range | undefined {
  const nodes = branch.nodes;
  let index = -1;
  if (direction < 0) {
    for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].range[0] < position) { index = i; break; }
  } else index = nodes.findIndex((node) => node.range[1] > position);
  if (index < 0) return undefined;
  // At an operator we stop after that one operator; the next press crosses the next term.
  if (nodes[index].kind === 'operator') return [...nodes[index].range];
  let left = index;
  let right = index;
  while (left > 0 && isFactor(nodes[left - 1])) left--;
  while (right < nodes.length - 1 && isFactor(nodes[right + 1])) right++;
  if (direction < 0) right = index; else left = index;
  return direction < 0
    ? [nodes[left].range[0], Math.min(position, nodes[right].range[1])]
    : [Math.max(position, nodes[left].range[0]), nodes[right].range[1]];
}

function isFactor(node: MathNode): boolean { return node.kind !== 'operator'; }
