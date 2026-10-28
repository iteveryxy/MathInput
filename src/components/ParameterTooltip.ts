import type { SnippetSessionStack } from '../snippets/SnippetSession';

export class ParameterTooltip {
  readonly element = document.createElement('div');
  constructor() { this.element.id = 'parameter-tooltip'; this.element.className = 'parameter-tooltip'; this.element.setAttribute('aria-live', 'polite'); }
  render(stack: SnippetSessionStack): void {
    const current = stack.current;
    this.element.hidden = !current;
    this.element.dataset.depth = String(stack.depth);
    if (!current) return;
    const parameter = current.snippet.parameters[current.index];
    this.element.title = `${parameter.name}：${parameter.description}`;
    const breadcrumb = document.createElement('span');
    breadcrumb.className = 'parameter-path';
    breadcrumb.textContent = stack.snapshot().map((session) => session.snippet.command).join(' › ');
    const name = document.createElement('strong'); name.textContent = parameter.name;
    const description = document.createElement('span'); description.textContent = parameter.description;
    const progress = document.createElement('span'); progress.className = 'parameter-progress'; progress.textContent = `${current.index + 1} / ${current.promptIds.length}`;
    this.element.replaceChildren(breadcrumb, name, description, progress);
  }
}
