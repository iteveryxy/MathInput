import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { t, type UiLanguage } from './Language';

export interface DesktopStatus { shortcut: string; error?: string; targetReady: boolean }
export interface SubmitResult { status: 'sent' | 'manual' | 'copied'; message: string }

export class DesktopBridge {
  readonly desktop = isTauri();
  async status(): Promise<DesktopStatus> {
    return this.desktop ? invoke('desktop_status') : { shortcut: 'Ctrl+Alt+M', targetReady: false };
  }
  async configureShortcut(shortcut: string): Promise<void> {
    if (this.desktop) await invoke('configure_shortcut', { shortcut });
  }
  async onOpen(callback: () => void): Promise<void> {
    if (this.desktop) await listen('editor-open', callback);
  }
  async setLanguage(language: UiLanguage): Promise<void> {
    if (this.desktop) await invoke('set_ui_language', { language });
  }
  async copy(text: string): Promise<SubmitResult> {
    if (this.desktop) return invoke('copy_text', { text });
    await navigator.clipboard.writeText(text);
    return { status: 'copied', message: t('已复制，可粘贴到需要的位置') };
  }
  async submit(text: string, autoPaste: boolean): Promise<SubmitResult> {
    if (this.desktop) return invoke('submit_text', { text, autoPaste });
    if (!autoPaste) return this.copy(text);
    return { status: 'manual', message: t('浏览器预览模式：请使用“仅复制”；全局快捷键与原窗口粘贴在桌面程序中可用') };
  }
  async cancel(): Promise<void> { if (this.desktop) await invoke('cancel_input'); }
  async drag(): Promise<void> { if (this.desktop) await getCurrentWindow().startDragging(); }
  async fit(height: number): Promise<void> {
    if (!this.desktop) return;
    const window = getCurrentWindow();
    const [size, scale] = await Promise.all([window.innerSize(), window.scaleFactor()]);
    const next = Math.ceil(Math.min(780, Math.max(188, height)));
    if (Math.abs(size.height / scale - next) > 3) await window.setSize(new LogicalSize(size.width / scale, next));
  }
}
