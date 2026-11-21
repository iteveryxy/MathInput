import type { CompletionState } from './CompletionEngine';
import type { Snippet } from '../snippets/types';
import { renderSnippet } from '../snippets/SnippetRegistry';
import type { MathfieldElement } from 'mathlive';
import { caretAnchor } from '../editor/CaretAnchor';
import { placeFloating } from './FloatingPosition';
import { candidateId, snippetKey } from '../packs/types';
import { renderMathPreview } from '../packs/MathPreview';
import { t, tr } from '../platform/Language';
import { packDisplayName, snippetDisplayName } from '../packs/FormulaPacks';

export class CompletionPopup {
  readonly element = document.createElement('section');
  private readonly previews = new Map<string, string>();
  private frame?: number;
  private revealActive=false;
  private readonly events=new AbortController();
  private readonly observer:ResizeObserver;
  constructor(private readonly accept: (snippet: Snippet, wrap: boolean) => void, private readonly field: MathfieldElement, private readonly popupId='completion-popup') {
    this.element.id = popupId;
    this.element.className = 'completion';
    this.element.setAttribute('role', 'listbox');
    this.element.addEventListener('pointerdown', (event) => event.preventDefault());
    this.element.hidden = true;
    document.body.append(this.element); // Portal: no contribution to shell/window height.
    window.addEventListener('resize', () => this.schedulePosition(true),{signal:this.events.signal});
    window.visualViewport?.addEventListener('resize', () => this.schedulePosition(true),{signal:this.events.signal});
    document.addEventListener('scroll', event => {if(!(event.target instanceof Node)||!this.element.contains(event.target))this.schedulePosition(true);}, {capture:true,signal:this.events.signal});
    this.observer=new ResizeObserver(() => this.schedulePosition(true));this.observer.observe(field);
  }
  destroy():void {this.events.abort();this.observer.disconnect();if(this.frame!==undefined)cancelAnimationFrame(this.frame);this.element.remove();}

  schedulePosition(revealActive=false): void {
    if(revealActive)this.revealActive=true;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => { this.frame = undefined; this.position(); });
  }

  private position(): void {
    if (this.element.hidden) return;
    const anchor = caretAnchor(this.field);
    const viewport = window.visualViewport;
    const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 0.85;
    const previousScroll=this.element.scrollTop;
    this.element.style.height = 'auto'; this.element.style.maxHeight = `${330 * scale}px`;
    const desiredHeight = Math.min(this.element.scrollHeight, 330 * scale);
    const placement = placeFloating(anchor, { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0, right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth), bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) }, 370 * scale, desiredHeight);
    Object.assign(this.element.style, { left: `${placement.left}px`, top: `${placement.top}px`, width: `${placement.width}px`, height: `${placement.maxHeight}px`, maxHeight: `${placement.maxHeight}px` });
    this.element.dataset.side = placement.side;
    this.element.style.visibility = 'visible';
    this.element.dataset.anchorX = String(anchor.left);
    this.element.dataset.anchorTop = String(anchor.top);
    this.element.dataset.anchorBottom = String(anchor.bottom);
    this.element.scrollTop=previousScroll;
    if(!this.revealActive)return;
    this.revealActive=false;
    const active = this.element.querySelector<HTMLElement>('.active');
    if (!active) return;
    const top = active.offsetTop;
    if (top < this.element.scrollTop + 20 * scale) this.element.scrollTop = Math.max(0, top - 20 * scale);
    else if (top + active.offsetHeight > this.element.scrollTop + this.element.clientHeight) this.element.scrollTop = top + active.offsetHeight - this.element.clientHeight;
  }

  render(state: CompletionState): void {
    this.element.setAttribute('aria-label', t('数学命令候选'));
    this.element.hidden = !state.open;
    if (!state.open) return;
    this.revealActive=true;
    this.element.style.visibility = 'hidden';
    const heading = document.createElement('div');
    heading.className = 'completion-heading';
    const count = state.candidates.length;
    const title = state.index < 0 ? tr('选择公式来源', 'Choose a formula source') : t('命令');
    heading.textContent = `${title}${state.query ? ` / ${state.query}` : ''} · ${count}`;
    this.element.replaceChildren(heading);
    const sources = new Map<string, Set<string>>();
    for (const snippet of state.candidates) {
      const packId = snippet.packId ?? 'basic-math';
      const source = packDisplayName(packId, snippet.packName ?? '基础数学');
      const ids = sources.get(source) ?? new Set<string>();
      ids.add(packId);
      sources.set(source, ids);
    }
    state.candidates.forEach((snippet, index) => {
      const row = document.createElement('div');
      row.className = `candidate${index === state.index ? ' active' : ''}`;
      row.id = candidateId(snippet,this.popupId);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === state.index));
      row.dataset.command = snippet.command;
      row.dataset.packId=snippet.packId??'basic-math';
      const command = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = snippet.command;
      const label = document.createElement('span');
      const displayName = snippetDisplayName(snippet);
      label.className = 'candidate-name'; label.textContent = displayName;
      command.append(name, label);
      const sourceName = packDisplayName(row.dataset.packId, snippet.packName ?? '基础数学');
      const sourceLabel = sources.get(sourceName)!.size > 1 ? `${sourceName} · ${row.dataset.packId}` : sourceName;
      row.setAttribute('aria-label', `${snippet.command} · ${displayName} · ${sourceLabel}`);
      const preview = document.createElement('div');
      preview.className = 'candidate-preview';
      const rendered=renderSnippet(snippet),cacheKey=snippetKey(snippet)+'\0'+rendered;
      try {if(!this.previews.has(cacheKey)){renderMathPreview(preview,rendered);if(this.previews.size>=256)this.previews.delete(this.previews.keys().next().value!);this.previews.set(cacheKey,preview.innerHTML);}else preview.innerHTML=this.previews.get(cacheKey)!;}
      catch {preview.textContent=t('预览不可用');}
      const description = document.createElement('div');
      description.className = 'candidate-description';
      const formula = document.createElement('span');
      formula.textContent = displayName;
      const source = document.createElement('small');
      source.className = 'candidate-source';
      source.textContent = sourceLabel;
      source.title = sourceLabel;
      description.append(formula, source);
      row.title = `${snippet.description} · ${sourceLabel}`;
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
