import { invoke, isTauri } from '@tauri-apps/api/core';
import type { FormulaPack } from './types';
export async function choosePackFile(): Promise<string | null> {
    if (isTauri())
        return invoke<string | null>('pick_formula_pack_file');
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.mathpack.json,.json,application/json';
        input.addEventListener('change', async () => { try {
            const file = input.files?.[0];
            if (!file) {
                resolve(null);
                return;
            }
            if (file.size > 262144)
                throw new Error('文件超过 256 KiB');
            resolve(await file.text());
        }
        catch (error) {
            reject(error);
        } }, { once: true });
        input.addEventListener('cancel', () => resolve(null), { once: true });
        input.click();
    });
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
