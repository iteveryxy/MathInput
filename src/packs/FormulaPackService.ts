import { initialPackState, registeredSnippets, replacePack, UNIVERSITY_PACKS } from './FormulaPacks';
import { createPackStorage } from './PackStorage';
import { validatePack, validateState } from './Validation';
import { BASE_PACK_ID, type FormulaPack, type PackState, type PackStorage } from './types';
export class FormulaPackService {
    state = initialPackState();
    error = '';
    ready = false;
    readonly invalidPacks = new Map<string, string>();
    private pending: Promise<unknown> = Promise.resolve();
    readonly changed = new Set<() => void>();
    constructor(private readonly storage: PackStorage = createPackStorage(), private readonly validateMath?: (pack: FormulaPack) => void) { }
    private audit(): void { this.invalidPacks.clear(); if (this.validateMath)
        for (const entry of this.state.packs) {
            try {
                this.validateMath(entry.pack);
            }
            catch (error) {
                this.invalidPacks.set(entry.pack.id, String(error));
            }
        } }
    async initialize(): Promise<void> {
        try {
            const saved = await this.storage.load();
            if (saved)
                this.state = saved;
            this.audit();
            this.ready = true;
        }
        catch (error) {
            this.error = `公式库未能读取，已保留原数据，暂不可修改：${String(error)}`;
        }
        this.emit();
    }
    private emit() { this.changed.forEach(callback => callback()); }
    mutate(change: (state: PackState) => PackState): Promise<void> {
        const run = async () => {
            if (!this.ready)
                throw new Error(this.error || '公式库仍在载入');
            const next = validateState(change(structuredClone(this.state)));
            const persisted = await this.storage.save(next, this.state.revision);
            this.state = persisted;
            this.audit();
            this.emit();
        };
        const result = this.pending.then(run);
        this.pending = result.catch(() => { });
        return result;
    }
    install(pack: FormulaPack, replace = false): Promise<void> { const checked = validatePack(pack); this.validateMath?.(checked); return this.mutate(state => replacePack(state, checked, replace)); }
    addUniversityPacks(): Promise<void> {
        return this.mutate(state => {
            for (const pack of UNIVERSITY_PACKS) {
                if (state.packs.some(entry => entry.pack.id === pack.id)) continue;
                this.validateMath?.(pack);
                state.packs.push({ pack, enabled: false });
            }
            return state;
        });
    }
    toggle(id: string, enabled: boolean): Promise<void> { return this.mutate(state => { if (id === BASE_PACK_ID)
        state.baseEnabled = enabled;
    else {
        const entry = state.packs.find(entry => entry.pack.id === id);
        if (!entry)
            throw new Error('公式包不存在');
        entry.enabled = enabled;
    } return state; }); }
    remove(id: string): Promise<void> { if (id === BASE_PACK_ID)
        return Promise.reject(new Error('内置包不可删除')); return this.mutate(state => ({ ...state, packs: state.packs.filter(entry => entry.pack.id !== id) })); }
    snippets(includeDisabled = false) { return registeredSnippets(this.state, includeDisabled).filter(snippet => includeDisabled || !this.invalidPacks.has(snippet.packId!)); }
    async recover(): Promise<void> {
        if (!this.storage.recover)
            throw new Error('此存储没有恢复接口');
        const restored = await this.storage.recover();
        this.state = restored;
        this.error = '';
        this.audit();
        this.ready = true;
        this.emit();
    }
}
