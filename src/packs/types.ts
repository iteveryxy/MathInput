import type { Snippet } from '../snippets/types';
export interface FormulaPack {
    schemaVersion: 1;
    id: string;
    name: string;
    version: string;
    author: string;
    description: string;
    snippets: Snippet[];
}
export interface PackEntry {
    enabled: boolean;
    pack: FormulaPack;
}
export interface PackState {
    schemaVersion: 1;
    revision: number;
    baseEnabled: boolean;
    packs: PackEntry[];
}
export interface PackStorage {
    load(): Promise<PackState | null>;
    save(state: PackState, expectedRevision: number): Promise<PackState>;
    recover?(): Promise<PackState>;
}
export const BASE_PACK_ID = 'basic-math';
export const MY_PACK_ID = 'my-formulas';
export const PACK_LIMITS = { fileBytes: 262144, stateBytes: 8388608, packs: 32, snippets: 128, parameters: 24, latex: 8192, nesting: 32 } as const;
export const snippetKey = (snippet: Snippet): string => snippet.packId && snippet.packId !== BASE_PACK_ID ? `${snippet.packId}:${snippet.id}` : snippet.id;
export const candidateId = (snippet: Snippet, popup = 'completion-popup'): string => `${popup}-candidate-${encodeURIComponent(snippetKey(snippet))}`;
