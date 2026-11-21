import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PACK_LIMITS, type FormulaPack } from './types';
import { tr } from '../platform/Language';

export interface PackFileInput {
    name: string;
    contents: string | null;
    error: 'extension' | 'size' | 'encoding' | 'read' | null;
}
export interface PackImportBatch { files: PackFileInput[]; skipped: number }

export function packFileError(error: PackFileInput['error']): string {
    switch (error) {
        case 'extension': return tr('请选择 .json 文件', 'Choose a .json file.');
        case 'size': return tr('文件超过 256 KiB', 'The file exceeds 256 KiB.');
        case 'encoding': return tr('文件须为 UTF-8 JSON', 'The file must use UTF-8 encoding.');
        default: return tr('无法读取文件', 'Unable to read the file.');
    }
}

export async function readPackFiles(selected: ArrayLike<File>): Promise<PackImportBatch> {
    const files = await Promise.all(Array.from(selected).slice(0, PACK_LIMITS.packs).map(async file => {
        const { name, size } = file;
        const result: PackFileInput = { name, contents: null, error: null };
        if (!name.toLowerCase().endsWith('.json')) return { ...result, error: 'extension' as const };
        if (size > PACK_LIMITS.fileBytes) return { ...result, error: 'size' as const };
        let bytes: ArrayBuffer;
        try { bytes = await file.arrayBuffer(); }
        catch { return { ...result, error: 'read' as const }; }
        try { result.contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { result.error = 'encoding'; }
        return result;
    }));
    return { files, skipped: Math.max(0, selected.length - PACK_LIMITS.packs) };
}

export async function choosePackFiles(): Promise<PackImportBatch> {
    if (isTauri())
        return invoke<PackImportBatch>('pick_formula_pack_files');
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.mathpack.json,.json,application/json';
        input.addEventListener('change', () => resolve(readPackFiles(input.files ?? [])), { once: true });
        input.addEventListener('cancel', () => resolve({ files: [], skipped: 0 }), { once: true });
        input.click();
    });
}

export async function onPackFiles(
    receive: (batch: PackImportBatch) => void,
    failed: (error: unknown) => void,
): Promise<void> {
    if (!isTauri()) {
        const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files');
        window.addEventListener('dragover', event => {
            if (hasFiles(event)) { event.preventDefault(); event.dataTransfer!.dropEffect = 'copy'; }
        });
        window.addEventListener('drop', event => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            const files = Array.from(event.dataTransfer!.files);
            void readPackFiles(files).then(receive, failed);
        });
        return;
    }

    // Subscribe before draining, so arguments received during startup are not lost.
    let pending = Promise.resolve();
    const drain = () => {
        pending = pending.then(async () => {
            const batch = await invoke<PackImportBatch>('take_pending_formula_pack_files');
            if (batch.files.length || batch.skipped) receive(batch);
        }).catch(failed);
    };
    await listen('formula-packs-pending', drain);
    drain();
}
export async function exportPackFile(pack: FormulaPack): Promise<string | null> {
    if (isTauri())
        return invoke<string | null>('export_formula_pack_file', { pack });
    const pretty = JSON.stringify(pack, null, 2) + '\n', raw = new TextEncoder().encode(pretty).length <= 262144 ? pretty : JSON.stringify(pack);
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${pack.id}-${pack.version}.mathpack.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return anchor.download;
}
