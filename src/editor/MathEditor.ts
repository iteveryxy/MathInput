import type { MathfieldElement, Range } from 'mathlive';
import { createMathfield } from './MathLiveSetup';
import { dispatchEnter } from './EditorState';
import { CompletionEngine } from '../completion/CompletionEngine';
import { completionQuery } from '../completion/CompletionQuery';
import { SnippetRegistry } from '../snippets/SnippetRegistry';
import { PlaceholderManager } from '../snippets/PlaceholderManager';
import { exportLatex } from '../output/LatexExporter';
import { MathStructureAdapter } from '../math/MathStructureAdapter';
import { MathNodeNavigator } from '../math/MathNodeNavigator';
import { CursorNavigation } from './CursorNavigation';
import { SelectionManager } from './SelectionManager';
import type { Snippet } from '../snippets/types';
import { SemanticEditing } from '../math/SemanticEditing';
import { EditHistoryBoundary } from './EditHistoryBoundary';

export interface EditorCallbacks { change(): void; submit(): void; cancel(): void; error(message: string): void }

/** Keyboard routing owns product semantics; MathLive owns WYSIWYG editing. */
export class MathEditor {
  readonly field: MathfieldElement = createMathfield();
  readonly registry = new SnippetRegistry();
  readonly completion = new CompletionEngine(() => this.registry.all());
  readonly placeholders = new PlaceholderManager(this.field);
  private readonly navigation = new CursorNavigation(this.field);
  private readonly selections = new SelectionManager(this.field);
  private readonly editHistory = new EditHistoryBoundary(this.field);
  private queryRange?: Range;
  private selectedBeforeQuery?: string;
  private mutating = false;
  private typedSinceCommand = false;
  composing = false;

  constructor(private readonly callbacks: EditorCallbacks) {
    this.field.addEventListener('keydown', (event) => this.keydown(event), true);
    this.field.addEventListener('input', () => this.input());
    this.field.addEventListener('selection-change', () => {
      if (!this.mutating) { this.selections.observe(); this.placeholders.syncParameterToCursor(); this.callbacks.change(); }
    });
    this.field.addEventListener('pointerdown', () => { this.selections.reset(); this.closeCompletion(); });
    this.field.addEventListener('compositionstart', () => { this.composing = true; this.closeCompletion(); });
    this.field.addEventListener('compositionend', () => {
      this.composing = false;
      // The final input event is allowed to settle before inspecting the caret.
      queueMicrotask(() => this.input());
    });
    this.field.addEventListener('beforeinput', (event) => {
      if (this.composing || (event as InputEvent).isComposing) return;
      const input = event as InputEvent;
      if (input.inputType === 'insertText' || input.inputType === 'insertFromPaste') {
        if (!this.field.selectionIsCollapsed && !this.completion.state.open) this.selectedBeforeQuery = this.field.getValue(this.field.selection, 'latex');
        this.selections.reset();
        this.typedSinceCommand = true;
      }
      if ((event as InputEvent).inputType === 'insertLineBreak') event.preventDefault();
    });
  }

  focus(): void { this.field.focus(); }
  get latex(): string { return exportLatex(this.field); }
  setLatex(latex: string): void {
    this.selections.reset();
    this.transaction(() => {
      this.placeholders.clear();
      this.field.setValue(latex, { selectionMode: 'after', format: 'latex', silenceNotifications: true });
      this.closeCompletion();
    });
  }

  private transaction(action: () => void): void {
    this.mutating = true;
    try { action(); this.placeholders.reconcile(); }
    catch (error) { this.callbacks.error(String(error instanceof Error ? error.message : error)); }
    finally { this.mutating = false; this.placeholders.record(); this.callbacks.change(); }
  }

  private input(): void {
    if (this.mutating) return;
    this.placeholders.reconcile();
    this.placeholders.record();
    this.selections.observe();
    if (!this.composing) {
      try {
        // Text services, Unicode SendInput and paste may insert without ASCII
        // keydown events. Programmatic edits are silent; input is authoritative.
        this.typedSinceCommand = true;
        this.refreshCompletion();
      } catch { this.closeCompletion(); }
    }
    this.callbacks.change();
  }

  closeCompletion(): void {
    this.completion.close(); this.queryRange = undefined; this.selectedBeforeQuery = undefined;
    this.typedSinceCommand = false;
    this.callbacks.change();
  }

  private refreshCompletion(): void {
    const { query: previousQuery, index } = this.completion.state;
    const query = completionQuery(this.field, this.completion);
    this.queryRange = query?.range;
    if (query?.query === previousQuery) this.completion.state.index = Math.min(index, this.completion.state.candidates.length - 1);
    if (!query) { this.completion.close(); this.selectedBeforeQuery = undefined; }
  }

  showCommands(): void {
    if (this.composing) return;
    this.queryRange = undefined;
    this.selectedBeforeQuery = undefined;
    this.completion.filter('', true);
    this.focus();
    this.callbacks.change();
  }

  accept(snippet?: Snippet, wrap = false): void {
    if (this.typedSinceCommand) this.refreshCompletion();
    snippet ??= this.completion.selected;
    if (!snippet || this.composing) return;
    this.transaction(() => {
      let range: Range = this.queryRange ? [...this.queryRange] : [...this.field.selection.ranges[0]];
      let wrapped: string | undefined;
      if (wrap && snippet.wrapTarget) {
        if (this.selectedBeforeQuery !== undefined) wrapped = this.selectedBeforeQuery;
        else if (!this.queryRange && !this.field.selectionIsCollapsed) wrapped = this.field.getValue(this.field.selection, 'latex');
        else {
          const left = new MathNodeNavigator(MathStructureAdapter.from(this.field)).leftTerm(range[0]);
          if (left) { wrapped = this.field.getValue(left, 'latex'); range = [left[0], range[1]]; }
        }
      }
      this.field.selection = { ranges: [range] };
      this.selections.reset();
      this.placeholders.insert(snippet, wrapped);
      this.closeCompletion();
      this.focus();
    });
  }

  unwrap(): void {
    const plan = new SemanticEditing(MathStructureAdapter.from(this.field)).unwrap(this.field.selection.ranges[0]);
    if (!plan) { this.callbacks.error('此处没有可安全解除的函数、根式或成对括号；分式和带指数的函数不会被改写'); return; }
    const content = this.field.getValue(plan.content, 'latex');
    this.transaction(() => {
      this.selections.reset(); this.closeCompletion();
      this.field.selection = { ranges: [plan.node.range] };
      this.editHistory.prepare();
      this.field.insert(content || '{}', { selectionMode: 'after', format: 'latex', silenceNotifications: true });
      this.focus();
    });
  }

  private delete(direction: -1 | 1, term: boolean): boolean {
    const semantic = new SemanticEditing(MathStructureAdapter.from(this.field));
    if (this.field.selectionIsCollapsed && !term) {
      const functionRange = semantic.functionName(this.field.position, direction);
      if (functionRange) { this.selections.preview(functionRange); this.callbacks.change(); return true; }
      const fence = semantic.singleFence(this.field.position, direction);
      if (fence?.node.fence) {
        const { node, remove } = fence;
        const body = this.field.getValue(node.fence!.content, 'latex');
        const text = remove === 'opening' ? body + node.fence!.closing : node.fence!.opening + body;
        this.transaction(() => {
          this.selections.reset();
          this.field.selection = { ranges: [node.range] };
          this.editHistory.prepare();
          this.field.insert(text || '{}', { format: 'latex', selectionMode: 'after', silenceNotifications: true });
          if (remove === 'opening') this.field.position = node.range[0];
        });
        return true;
      }
      // Keep MathLive's fine editing behavior everywhere else.
      this.selections.reset();
      return false;
    }
    if (!term && !this.selections.active) return false;
    this.transaction(() => {
      if (this.field.selectionIsCollapsed) {
        const range = semantic.adjacentTerm(this.field.position, direction);
        if (!range) return;
        this.field.selection = { ranges: [range] };
      }
      this.selections.reset();
      // Empty public insertion replaces a nonempty selection in one insertion
      // transaction, distinct from MathLive's coalesced character deletions.
      this.editHistory.prepare();
      this.field.insert('', { format: 'latex', insertionMode: 'replaceSelection', selectionMode: 'after', silenceNotifications: true });
    });
    return true;
  }

  private keydown(event: KeyboardEvent): void {
    if (this.composing || event.isComposing || event.keyCode === 229) return;
    const stop = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    const ctrl = event.ctrlKey || event.metaKey;
    try {
      if (ctrl && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) {
        stop();
        this.selections.reset();
        this.mutating = true;
        this.field.executeCommand(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
        this.placeholders.restoreAfterUndo();
        this.mutating = false;
        this.closeCompletion();
        this.callbacks.change();
        return;
      }
      if (ctrl && event.altKey && event.code === 'KeyU') { stop(); this.unwrap(); return; }
      if (ctrl && !event.altKey && !event.shiftKey && event.code === 'KeyM') {
        stop(); this.selections.reset(); this.closeCompletion();
        const target = new SemanticEditing(MathStructureAdapter.from(this.field)).matchingFence(this.field.position);
        if (target !== undefined) this.field.position = target;
        this.callbacks.change(); return;
      }
      if (ctrl && event.code === 'Space') { stop(); this.showCommands(); return; }
      if (!ctrl && !event.altKey && this.completion.state.open && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        stop(); this.completion.move(event.key === 'ArrowDown' ? 1 : -1); this.callbacks.change(); return;
      }
      if (event.key === 'Enter') {
        stop();
        if (this.typedSinceCommand) this.refreshCompletion();
        const action = dispatchEnter({ composing: this.composing, completion: this.completion.state.open, snippet: this.placeholders.stack.depth > 0 }, event.shiftKey);
        if (action === 'accept-completion' || action === 'wrap-completion') this.accept(undefined, action === 'wrap-completion');
        else if (action === 'finish-snippet') this.transaction(() => this.placeholders.finish());
        else if (action === 'submit') this.callbacks.submit();
        return;
      }
      if (event.key === 'Tab' && this.placeholders.stack.current) {
        stop(); this.closeCompletion(); this.transaction(() => this.placeholders.tab(event.shiftKey)); return;
      }
      if (event.key === 'Escape') {
        stop();
        if (this.completion.state.open) this.closeCompletion();
        else if (this.selections.clear()) this.callbacks.change();
        else this.callbacks.cancel();
        return;
      }
      if (!event.altKey && (event.key === 'Backspace' || event.key === 'Delete')) {
        this.closeCompletion();
        if (this.delete(event.key === 'Backspace' ? -1 : 1, ctrl)) stop();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (ctrl && !event.altKey) {
          stop(); this.closeCompletion();
          if (event.shiftKey) this.selections.extend(event.key === 'ArrowLeft' ? -1 : 1);
          else { this.selections.reset(); this.navigation.move(event.key === 'ArrowLeft' ? -1 : 1, false); }
          this.callbacks.change(); return;
        }
        if (event.altKey && !event.shiftKey && !ctrl) {
          stop(); this.selections.reset(); this.closeCompletion(); this.navigation.move(event.key === 'ArrowLeft' ? -1 : 1, true); this.callbacks.change(); return;
        }
        if (event.altKey && event.shiftKey && !ctrl) {
          stop(); this.closeCompletion(); this.selections.resize(event.key === 'ArrowRight'); this.callbacks.change(); return;
        }
        this.selections.reset(); this.closeCompletion();
      }
      if (!ctrl && !event.altKey && /^[a-zA-Z]$/.test(event.key)) {
        if (!this.field.selectionIsCollapsed && !this.completion.state.open) this.selectedBeforeQuery = this.field.getValue(this.field.selection, 'latex');
        this.typedSinceCommand = true;
      } else if (event.key !== 'Shift' && event.key !== 'Backspace') this.closeCompletion();
    } catch (error) { this.callbacks.error(error instanceof Error ? error.message : String(error)); }
  }
}
