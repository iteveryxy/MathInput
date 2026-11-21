import { BUILTIN_SNIPPETS } from './BuiltinSnippets';
import type { Snippet } from './types';
import { snippetKey } from '../packs/types';
import { joinLatex } from '../output/TexTokens';

export class SnippetRegistry {
  private readonly snippets = new Map<string, Snippet>();

  constructor(initial: Snippet[] = BUILTIN_SNIPPETS) { initial.forEach((snippet) => this.register(snippet)); }

  register(snippet: Snippet): void {
    if (!/^[a-z][a-z0-9-]*$/i.test(snippet.id)) throw new Error('模板标识必须是字母、数字或短横线');
    if (new Set(snippet.parameters.map((p) => p.id)).size !== snippet.parameters.length) throw new Error('参数标识不能重复');
    const slots = [...snippet.latex.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]);
    if (slots.some((id) => !snippet.parameters.some((p) => p.id === id)) || snippet.parameters.some((p) => !slots.includes(p.id))) throw new Error('模板与参数声明不一致');
    if (snippet.wrapTarget && !snippet.parameters.some((p) => p.id === snippet.wrapTarget)) throw new Error('包裹目标不存在');
    const key = snippetKey(snippet);
    if(this.snippets.has(key)) throw new Error(`模板标识已存在：${key}`);
    this.snippets.set(key, snippet);
  }

  get(id: string): Snippet | undefined { return this.snippets.get(id); }
  all(): Snippet[] { return [...this.snippets.values()]; }
  replace(snippets: Snippet[]): void {
    const next = new SnippetRegistry(snippets);
    this.snippets.clear(); next.all().forEach(snippet=>this.snippets.set(snippetKey(snippet),snippet));
  }
}

export function renderSnippet(snippet: Snippet, values: Record<string, string> = {}): string {
  let result='',end=0;
  for(const match of snippet.latex.matchAll(/\{\{(\w+)\}\}/g)) {
    result=joinLatex(result,snippet.latex.slice(end,match.index));
    result=joinLatex(result,(Object.hasOwn(values,match[1])?values[match[1]]:undefined)??snippet.parameters.find(parameter=>parameter.id===match[1])?.defaultValue??'');
    end=match.index+match[0].length;
  }
  return joinLatex(result,snippet.latex.slice(end));
}
