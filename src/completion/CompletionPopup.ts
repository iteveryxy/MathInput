import { convertLatexToMarkup } from 'mathlive';
import type { CompletionState } from './CompletionEngine';
import type { Snippet } from '../snippets/types';
import { renderSnippet } from '../snippets/SnippetRegistry';
import type { MathfieldElement } from 'mathlive';
import { caretAnchor } from '../editor/CaretAnchor';
import { placeFloating } from './FloatingPosition';

export class CompletionPopup {
  readonly element = document.createElement('section');
  private readonly previews = new Map<string, string>();
  private frame?: number;
  constructor(private readonly accept: (snippet: Snippet, wrap: boolean) => void, private readonly field: MathfieldElement) {
    this.element.id = 'completion-popup';
    this.element.className = 'completion';
    this.element.setAttribute('role', 'listbox');
    this.element.setAttribute('aria-label', '数学命令候选');
    this.element.addEventListener('pointerdown', (event) => event.preventDefault());
    this.element.hidden = true;
    document.body.append(this.element); // Portal: no contribution to shell/window height.
    window.addEventListener('resize', () => this.schedulePosition());
    window.visualViewport?.addEventListener('resize', () => this.schedulePosition());
    document.addEventListener('scroll', () => this.schedulePosition(), true);
    new ResizeObserver(() => this.schedulePosition()).observe(field);
  }

  schedulePosition(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => { this.frame = undefined; this.position(); });
  }

  private position(): void {
    if (this.element.hidden) return;
    const anchor = caretAnchor(this.field);
    const viewport = window.visualViewport;
    const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 0.85;
    this.element.style.height = 'auto'; this.element.style.maxHeight = `${330 * scale}px`;
    const desiredHeight = Math.min(this.element.scrollHeight, 330 * scale);
    const placement = placeFloating(anchor, { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0, right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth), bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) }, 370 * scale, desiredHeight);
    Object.assign(this.element.style, { left: `${placement.left}px`, top: `${placement.top}px`, width: `${placement.width}px`, height: `${placement.maxHeight}px`, maxHeight: `${placement.maxHeight}px` });
    this.element.dataset.side = placement.side;
    this.element.style.visibility = 'visible';
    this.element.dataset.anchorX = String(anchor.left);
    this.element.dataset.anchorTop = String(anchor.top);
    this.element.dataset.anchorBottom = String(anchor.bottom);
    const active = this.element.querySelector<HTMLElement>('.active');
    if (!active) return;
    const top = active.offsetTop;
    if (top < this.element.scrollTop + 20 * scale) this.element.scrollTop = Math.max(0, top - 20 * scale);
    else if (top + active.offsetHeight > this.element.scrollTop + this.element.clientHeight) this.element.scrollTop = top + active.offsetHeight - this.element.clientHeight;
  }

  render(state: CompletionState): void {
    this.element.hidden = !state.open;
    if (!state.open) return;
    this.element.style.visibility = 'hidden';
    const heading = document.createElement('div');
    heading.className = 'completion-heading';
    heading.textContent = `命令${state.query ? ` / ${state.query}` : ''} · ${state.candidates.length} 项`;
    this.element.replaceChildren(heading);
    state.candidates.forEach((snippet, index) => {
      const row = document.createElement('div');
      row.className = `candidate${index === state.index ? ' active' : ''}`;
      row.id = `candidate-${snippet.id}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === state.index));
      row.dataset.command = snippet.id;
      const command = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = snippet.command;
      const label = document.createElement('span');
      label.className = 'candidate-name'; label.textContent = snippet.name;
      command.append(name, label);
      const preview = document.createElement('div');
      preview.className = 'candidate-preview';
      if (!this.previews.has(snippet.id)) this.previews.set(snippet.id, convertLatexToMarkup(renderSnippet(snippet)));
      preview.innerHTML = this.previews.get(snippet.id)!;
      const description = document.createElement('div');
      description.className = 'candidate-description';
      description.textContent = snippet.name;
      row.title = snippet.description;
      const parameters = document.createElement('div');
      parameters.className = 'candidate-parameters';
      parameters.textContent = snippet.parameters.map((parameter) => `${parameter.defaultValue} · ${parameter.name}`).join('   ');
      row.append(command, preview, description, parameters);
      row.addEventListener('click', (event) => this.accept(snippet, event.shiftKey));
      this.element.append(row);
    });
    this.schedulePosition();
  }
}
