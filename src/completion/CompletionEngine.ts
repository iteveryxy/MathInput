import type { Snippet } from '../snippets/types';
import { normalizeQuery, type CustomAliases } from './AliasResolver';
import { BASE_PACK_ID, snippetKey } from '../packs/types';

export interface CompletionState { query: string; candidates: Snippet[]; index: number; open: boolean }

export class CompletionEngine {
  state: CompletionState = { query: '', candidates: [], index: 0, open: false };
  aliases: CustomAliases = {};
  constructor(private readonly snippets: () => Snippet[]) {}

  filter(query: string, showAll = false): CompletionState {
    const q = normalizeQuery(query);
    const scored = !q && !showAll ? [] : this.snippets().map((snippet, order) => {
      const names = [snippet.command, ...snippet.aliases, ...(this.aliases[snippetKey(snippet)] ?? [])];
      const score = !q ? order : names.reduce((best, name, i) => {
        const lower = normalizeQuery(name);
        return Math.min(best, lower === q ? i === 0 ? 0 : 1 : lower.startsWith(q) ? i === 0 ? 2 : 3 : Number.POSITIVE_INFINITY);
      }, normalizeQuery(snippet.name) === q ? 1 : Number.POSITIVE_INFINITY);
      return { snippet, score, order };
    });
    if (q) {
      const exactNames = new Set(scored.filter(({ score }) => score <= 1).map(({ snippet }) => normalizeQuery(snippet.name)));
      for (const match of scored)
        if (match.score > 1 && exactNames.has(normalizeQuery(match.snippet.name))) match.score = 1;
    }
    const matches = scored.filter(({ score }) => Number.isFinite(score)).sort((a, b) => {
      if(a.score<=1&&b.score<=1) {
        const priority=(snippet:Snippet)=>!snippet.packId||snippet.packId===BASE_PACK_ID?0:1;
        const difference=priority(a.snippet)-priority(b.snippet);if(difference)return difference;
      }
      return a.score-b.score||a.order-b.order;
    });
    const candidates = matches.map(({ snippet }) => snippet);
    const ambiguous = !!q && matches.filter(({ score }) => score <= 1).length > 1;
    this.state = { query, candidates, index: ambiguous ? -1 : 0, open: candidates.length > 0 };
    return this.state;
  }

  move(delta: number): void {
    const length = this.state.candidates.length;
    if (!length) return;
    if (this.state.index < 0) this.state.index = delta < 0 ? length - 1 : 0;
    else this.state.index = (this.state.index + delta + length) % length;
  }
  get selected(): Snippet | undefined { return this.state.candidates[this.state.index]; }
  close(): void { this.state.open = false; }
}
