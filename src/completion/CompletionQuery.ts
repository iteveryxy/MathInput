import type { MathfieldElement, Range } from 'mathlive';
import type { CompletionEngine } from './CompletionEngine';
import { MathStructureAdapter } from '../math/MathStructureAdapter';

/** The longest matching suffix of literal letters at the CURRENT editable branch.
 * It permits `b` followed by `sqrt`, with `b` retained as the left wrap target.
 */
export function completionQuery(field: MathfieldElement, engine: CompletionEngine): { query: string; range: Range } | undefined {
  if (!field.selectionIsCollapsed) return undefined;
  const branch = MathStructureAdapter.from(field).branchAt(field.position);
  const letters = [];
  let end = field.position;
  for (let i = branch.nodes.length - 1; i >= 0; i--) {
    const node = branch.nodes[i];
    if (node.range[1] > field.position) continue;
    if (node.range[1] !== end || !/^[a-zA-Z0-9]+$/.test(node.latex) || node.branches.length) break;
    letters.unshift(node);
    end = node.range[0];
    if (letters.length >= 40) break;
  }
  for (let i = 0; i < letters.length; i++) {
    const query = letters.slice(i).map((node) => node.latex).join('');
    if (engine.filter(query).open) return { query, range: [letters[i].range[0], field.position] };
  }
  return undefined;
}
