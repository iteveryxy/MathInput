import { invoke, isTauri } from '@tauri-apps/api/core';
import { validateState } from './Validation';
import type { PackState, PackStorage } from './types';
export const PACK_STORAGE_KEY = 'math-input.formula-packs.v1';
export class LocalPackStorage implements PackStorage {
    private locked<T>(action: () => T): Promise<T> { return typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(PACK_STORAGE_KEY, action) : Promise.resolve().then(action); }
    async load(): Promise<PackState | null> {
        const raw = localStorage.getItem(PACK_STORAGE_KEY);
        return raw === null ? null : validateState(JSON.parse(raw));
    }
    async save(state: PackState, expectedRevision: number): Promise<PackState> {
        const write = () => {
            const raw = localStorage.getItem(PACK_STORAGE_KEY), current = raw === null ? null : validateState(JSON.parse(raw));
            if ((current?.revision ?? 0) !== expectedRevision)
                throw new Error('公式库已在另一个窗口变化，请重新打开后再保存');
            const next = validateState({ ...state, revision: expectedRevision + 1 });
            if (raw !== null)
                localStorage.setItem(PACK_STORAGE_KEY + '.backup', raw);
            localStorage.setItem(PACK_STORAGE_KEY, JSON.stringify(next));
            return next;
        };
        return this.locked(write);
    }
    async recover(): Promise<PackState> {
        return this.locked(() => {
            const raw = localStorage.getItem(PACK_STORAGE_KEY + '.backup');
            if (raw === null)
                throw new Error('没有可恢复的公式库备份');
            const backup = validateState(JSON.parse(raw)), current = localStorage.getItem(PACK_STORAGE_KEY);
            if (current !== null)
                localStorage.setItem(PACK_STORAGE_KEY + '.corrupt.' + crypto.randomUUID(), current);
            const restored = validateState({ ...backup, revision: backup.revision + 1 });
            localStorage.setItem(PACK_STORAGE_KEY, JSON.stringify(restored));
            return restored;
        });
    }
}
export class DesktopPackStorage implements PackStorage {
    async load(): Promise<PackState | null> { const value = await invoke<PackState | null>('load_formula_packs'); return value === null ? null : validateState(value); }
    async save(state: PackState, expectedRevision: number): Promise<PackState> { return validateState(await invoke('save_formula_packs', { state, expectedRevision })); }
    async recover(): Promise<PackState> { return validateState(await invoke('restore_formula_pack_backup')); }
}
export const createPackStorage = (): PackStorage => isTauri() ? new DesktopPackStorage() : new LocalPackStorage();
