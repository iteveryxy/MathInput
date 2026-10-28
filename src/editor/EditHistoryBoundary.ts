import type { MathfieldElement } from 'mathlive';

/** MathLive can coalesce fine deletions and notify a snapshot before mutation.
 * Commit the selected current content if needed, then separate the next edit.
 * Uses only public selection, insertion, commands and undo-state-change events.
 */
export class EditHistoryBoundary {
  private recordedValue?: string;
  constructor(private readonly field: MathfieldElement) {
    field.addEventListener('undo-state-change', () => { this.recordedValue = field.value; });
  }
  prepare(): void {
    if (this.field.selectionIsCollapsed) return;
    if (this.recordedValue !== this.field.value) {
      const content = this.field.getValue(this.field.selection, 'latex');
      this.field.insert(content, { format: 'latex', selectionMode: 'item', silenceNotifications: true });
    }
    const selection = this.field.selection;
    // A documented navigation command ends coalescing and records a safe caret
    // at the selection boundary. Restore the intended range synchronously.
    this.field.executeCommand('moveToNextChar');
    this.field.selection = selection;
  }
}
