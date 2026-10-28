import type { Snippet } from './types';

export interface SnippetSession {
  id: string;
  snippet: Snippet;
  anchor: string;
  promptIds: string[];
  index: number;
}

/** Pure session stack. Parent index stays suspended while a child owns Tab/Enter. */
export class SnippetSessionStack {
  private sessions: SnippetSession[] = [];
  get current(): SnippetSession | undefined { return this.sessions.at(-1); }
  get depth(): number { return this.sessions.length; }
  push(session: SnippetSession): void { this.sessions.push(session); }
  next(): 'next' | 'finished' | 'none' {
    const session = this.current;
    if (!session) return 'none';
    if (session.index + 1 < session.promptIds.length) { session.index++; return 'next'; }
    return 'finished';
  }
  previous(): boolean {
    if (!this.current || this.current.index === 0) return false;
    this.current.index--;
    return true;
  }
  pop(): SnippetSession | undefined { return this.sessions.pop(); }
  clear(): void { this.sessions = []; }
  snapshot(): SnippetSession[] { return this.sessions.map((session) => ({ ...session, promptIds: [...session.promptIds] })); }
  restore(sessions: SnippetSession[]): void { this.sessions = sessions.map((session) => ({ ...session, promptIds: [...session.promptIds] })); }
  reconcile(prompts: string[]): void {
    const live = new Set(prompts);
    const missing = this.sessions.findIndex((session) => !live.has(session.anchor));
    if (missing >= 0) this.sessions.splice(missing);
  }
}
