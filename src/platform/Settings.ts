import type { OutputMode } from '../output/MarkdownFormatter';
import { parseAliases, type CustomAliases } from '../completion/AliasResolver';

export interface Settings { shortcut: string; outputMode: OutputMode; autoPaste: boolean; aliases: CustomAliases; uiScale: number; compact: boolean }
export const DEFAULT_SETTINGS: Settings = { shortcut: 'Ctrl+Alt+M', outputMode: 'inline', autoPaste: true, aliases: {}, uiScale: 85, compact: true };
export function appearance(value: Partial<Settings>): Pick<Settings, 'uiScale' | 'compact'> {
  return { uiScale: typeof value.uiScale === 'number' && Number.isFinite(value.uiScale) && value.uiScale >= 65 && value.uiScale <= 125 ? value.uiScale : 85, compact: typeof value.compact === 'boolean' ? value.compact : true };
}
const SETTINGS_KEY = 'math-input.settings.v1';
export const DRAFT_KEY = 'math-input.draft.v1';
export const RESULT_KEY = 'math-input.result.v1';

export function loadSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<Settings> | null;
    if (!value) return { ...DEFAULT_SETTINGS };
    return { shortcut: typeof value.shortcut === 'string' ? value.shortcut : DEFAULT_SETTINGS.shortcut, outputMode: ['inline', 'block', 'latex'].includes(value.outputMode ?? '') ? value.outputMode! : 'inline', autoPaste: typeof value.autoPaste === 'boolean' ? value.autoPaste : true, aliases: value.aliases && typeof value.aliases === 'object' && Object.values(value.aliases).every((names) => Array.isArray(names) && names.every((name) => typeof name === 'string')) ? value.aliases : {}, ...appearance(value) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(settings: Settings): void { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
export function parseSettings(shortcut: string, outputMode: string, autoPaste: boolean, aliasText: string, ids: string[], uiScale = 85, compact = true): Settings {
  if (!/^(Ctrl|Control)\+(Alt|Shift)\+(?:Shift\+)?[A-Z0-9]$/i.test(shortcut.trim())) throw new Error('快捷键格式示例：Ctrl+Alt+M 或 Ctrl+Shift+M');
  if (!['inline', 'block', 'latex'].includes(outputMode)) throw new Error('输出模式无效');
  if (!Number.isFinite(uiScale) || uiScale < 65 || uiScale > 125) throw new Error('界面缩放须为 65% 到 125%');
  return { shortcut: shortcut.trim(), outputMode: outputMode as OutputMode, autoPaste, aliases: parseAliases(aliasText, ids), uiScale, compact };
}
