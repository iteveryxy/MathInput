import { BUILTIN_SNIPPETS } from './BuiltinSnippets';
import type { Snippet } from './types';

export class SnippetRegistry {
  private readonly snippets = new Map<string, Snippet>();

  constructor(initial: Snippet[] = BUILTIN_SNIPPETS) { initial.forEach((snippet) => this.register(snippet)); }

  register(snippet: Snippet): void {
    if (!/^[a-z][a-z0-9-]*$/i.test(snippet.id)) throw new Error('模板标识必须是字母、数字或短横线');
    if (new Set(snippet.parameters.map((p) => p.id)).size !== snippet.parameters.length) throw new Error('参数标识不能重复');
    const slots = [...snippet.latex.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]);
    if (slots.some((id) => !snippet.parameters.some((p) => p.id === id)) || snippet.parameters.some((p) => !slots.includes(p.id))) throw new Error('模板与参数声明不一致');
    if (snippet.wrapTarget && !snippet.parameters.some((p) => p.id === snippet.wrapTarget)) throw new Error('包裹目标不存在');
    this.snippets.set(snippet.id, snippet);
  }

  get(id: string): Snippet | undefined { return this.snippets.get(id); }
  all(): Snippet[] { return [...this.snippets.values()]; }
}

export function renderSnippet(snippet: Snippet, values: Record<string, string> = {}): string {
  return snippet.latex.replace(/\{\{(\w+)\}\}/g, (_, id: string) => values[id] ?? snippet.parameters.find((p) => p.id === id)?.defaultValue ?? '');
}
