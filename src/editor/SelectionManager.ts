import type { MathfieldElement, Range } from 'mathlive';
import { MathNodeNavigator } from '../math/MathNodeNavigator';
import { MathStructureAdapter } from '../math/MathStructureAdapter';

export class SelectionManager {
  private history: Range[] = [];
  private expected?: string;
  private direction?: -1 | 1;
  private applying = false;
  private value?: string;
  get active(): boolean { return this.field.dataset.semanticSelection === 'true' && !this.field.selectionIsCollapsed; }
  constructor(private readonly field: MathfieldElement) {}
  reset(): void { this.history = []; this.expected = undefined; this.direction = undefined; this.value = undefined; delete this.field.dataset.semanticSelection; }
  observe(): void {
    if (!this.applying && (this.expected !== JSON.stringify(this.field.selection.ranges[0]) || this.value !== this.field.value)) this.reset();
  }
  private assign(range: Range): void {
    this.expected = JSON.stringify(range); this.value = this.field.value;
    this.applying = true;
    try { this.field.selection = { ranges: [range], direction: this.direction === -1 ? 'backward' : 'forward' }; }
    finally { this.applying = false; }
    if (range[0] !== range[1]) this.field.dataset.semanticSelection = 'true';
    else delete this.field.dataset.semanticSelection;
  }
  preview(range: Range): void { this.reset(); this.assign(range); }
  clear(): boolean {
    if (!this.active) return false;
    const position = this.field.position;
    this.reset(); this.field.position = position;
    return true;
  }
  extend(direction: -1 | 1): void {
    this.observe();
    if (this.history.length && this.direction !== direction) { this.resize(false); return; }
    this.direction = direction;
    this.resize(true);
  }
  resize(expand: boolean): void {
    const current = this.field.selection.ranges[0];
    if (this.expected !== JSON.stringify(current)) this.history = [];
    if (expand) {
      const next = new MathNodeNavigator(MathStructureAdapter.from(this.field)).expansion(current, this.direction ?? -1);
      if (next) { this.history.push([...current]); this.assign(next); }
    } else {
      const previous = this.history.pop();
      if (previous) this.assign(previous);
    }
  }
}
