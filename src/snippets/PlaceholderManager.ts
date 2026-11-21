import type { MathfieldElement } from 'mathlive';
import type { Snippet } from './types';
import { renderSnippet } from './SnippetRegistry';
import { SnippetSessionStack, type SnippetSession } from './SnippetSession';
import { stripPrompts } from '../output/LatexExporter';

export class PlaceholderManager {
  readonly stack = new SnippetSessionStack();
  private serial = 0;
  private readonly history = new Map<string, SnippetSession[]>();
  constructor(private readonly field: MathfieldElement) {}

  insert(snippet: Snippet, wrapped?: string): void {
    this.record();
    const id = `mi${++this.serial}`;
    const values: Record<string, string> = Object.create(null);
    const promptIds = snippet.parameters.map((parameter) => {
      const prompt = `${id}-${parameter.id}`;
      const value = parameter.id === snippet.wrapTarget && wrapped !== undefined ? wrapped : parameter.defaultValue;
      values[parameter.id] = `\\placeholder[${prompt}]{${value}}`;
      return prompt;
    });
    const latex = renderSnippet(snippet, values);
    if (!promptIds.length) { this.field.insert(latex, { selectionMode: 'after', silenceNotifications: true }); return; }
    const anchor = `${id}-template`;
    this.field.insert(`\\placeholder[${anchor}]{${latex}}`, { selectionMode: 'after', format: 'latex', silenceNotifications: true });
    const session: SnippetSession = { id, snippet, anchor, promptIds, index: 0 };
    this.stack.push(session);
    this.selectCurrent();
    this.record();
  }

  selectCurrent(): void {
    const current = this.stack.current;
    if (!current) return;
    const range = this.field.getPromptRange(current.promptIds[current.index]);
    if (range) {
      this.field.selection = { ranges: [range] };
      this.field.executeCommand('scrollIntoView');
    } else this.finish();
  }

  tab(backward = false): void {
    if (backward) { if (this.stack.previous()) this.selectCurrent(); }
    else if (this.stack.next() === 'finished') this.finish();
    else this.selectCurrent();
    this.record();
  }

  finish(): void {
    this.record();
    const session = this.stack.pop();
    if (!session) return;
    const range = this.field.getPromptRange(session.anchor);
    // Unwrap the completed session in one public insertion transaction. Parent
    // prompt IDs survive, so a nested template returns to its suspended parent.
    if (range) {
      const content = stripPrompts(this.field.getPromptValue(session.anchor, 'latex'));
      this.field.selection = { ranges: [[range[0] - 1, range[1] + 1]] };
      this.field.insert(content, { selectionMode: 'after', format: 'latex', silenceNotifications: true });
    }
    this.record();
  }

  reconcile(): void { this.stack.reconcile(this.field.getPrompts()); }
  record(): void {
    this.history.set(this.field.value, this.stack.snapshot());
    if (this.history.size > 200) this.history.delete(this.history.keys().next().value!);
  }
  restoreAfterUndo(): void {
    this.stack.restore(this.history.get(this.field.value) ?? []);
    this.reconcile();
  }
  clear(): void { this.stack.clear(); this.record(); }

  syncParameterToCursor(): void {
    const current = this.stack.current;
    if (!current) return;
    for (let i = 0; i < current.promptIds.length; i++) {
      const range = this.field.getPromptRange(current.promptIds[i]);
      if (range && this.field.position >= range[0] && this.field.position <= range[1]) { current.index = i; return; }
    }
  }
}
