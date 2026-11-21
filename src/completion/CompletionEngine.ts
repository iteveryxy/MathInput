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
    const candidates = !q && !showAll ? [] : this.snippets().map((snippet, order) => {
      const names = [snippet.command, ...snippet.aliases, ...(this.aliases[snippetKey(snippet)] ?? [])];
      const score = !q ? order : names.reduce((best, name, i) => {
        const lower = normalizeQuery(name);
        return Math.min(best, lower === q ? i === 0 ? 0 : 1 : lower.startsWith(q) ? i === 0 ? 2 : 3 : Number.POSITIVE_INFINITY);
      }, Number.POSITIVE_INFINITY);
      return { snippet, score, order };
    }).filter(({ score }) => Number.isFinite(score)).sort((a, b) => {
      if(a.score<=1&&b.score<=1) {
        const priority=(snippet:Snippet)=>!snippet.packId||snippet.packId===BASE_PACK_ID?0:1;
        const difference=priority(a.snippet)-priority(b.snippet);if(difference)return difference;
      }
      return a.score-b.score||a.order-b.order;
    }).map(({ snippet }) => snippet);
    this.state = { query, candidates, index: 0, open: candidates.length > 0 };
    return this.state;
  }

  move(delta: number): void {
    const length = this.state.candidates.length;
    if (length) this.state.index = (this.state.index + delta + length) % length;
  }
  get selected(): Snippet | undefined { return this.state.candidates[this.state.index]; }
  close(): void { this.state.open = false; }
}
