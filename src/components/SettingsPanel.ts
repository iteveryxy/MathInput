import type { Settings } from '../platform/Settings';
import { parseSettings } from '../platform/Settings';

export class SettingsPanel {
  readonly element = document.createElement('section');
  constructor(private readonly save: (settings: Settings) => Promise<void>, private readonly ids: string[], private readonly preview?: (settings: Pick<Settings, 'uiScale' | 'compact'>) => void) {
    this.element.id = 'settings-panel';
    this.element.className = 'settings-panel';
    this.element.hidden = true;
  }
  toggle(settings: Settings): void {
    this.element.hidden = !this.element.hidden;
    if (this.element.hidden) return;
    this.element.innerHTML = `
      <div class="panel-title">偏好设置 <span>仅保存在本机</span></div>
      <form id="settings-form">
        <div class="settings-grid">
          <label>全局快捷键<input name="shortcut" aria-label="全局快捷键" autocomplete="off" spellcheck="false"></label>
          <label>默认输出<select name="mode" aria-label="默认输出"><option value="inline">行内 Markdown · $…$</option><option value="block">块级 Markdown · $$…$$</option><option value="latex">纯 LaTeX</option></select></label>
        </div>
        <label class="scale-setting">界面缩放 <output id="scale-value"></output><input name="scale" type="range" min="65" max="125" step="1" aria-label="界面缩放"></label>
        <label class="checkbox"><input name="compact" type="checkbox" aria-label="紧凑模式">紧凑模式</label>
        <label class="checkbox"><input name="paste" type="checkbox">提交时尝试粘贴到原输入框</label>
        <label>自定义别名 <span>每行一项，例如 sqrt=kg,pfg</span><textarea name="aliases" aria-label="自定义别名" rows="3" spellcheck="false" placeholder="sqrt=kg,pfg&#10;frac=fen"></textarea></label>
        <p class="settings-note">“仅复制”会用公式替换剪贴板。自动粘贴仅临时使用可安全恢复的纯文本剪贴板；图片、文件和其他格式会保留，并提示手动复制。</p>
        <div class="settings-actions"><span id="settings-error" role="alert"></span><button type="button" id="settings-cancel">取消</button><button class="primary" type="submit">保存设置</button></div>
      </form>`;
    const form = this.element.querySelector<HTMLFormElement>('form')!;
    const shortcut = form.elements.namedItem('shortcut') as HTMLInputElement;
    const mode = form.elements.namedItem('mode') as HTMLSelectElement;
    const paste = form.elements.namedItem('paste') as HTMLInputElement;
    const aliases = form.elements.namedItem('aliases') as HTMLTextAreaElement;
    const scale = form.elements.namedItem('scale') as HTMLInputElement;
    const compact = form.elements.namedItem('compact') as HTMLInputElement;
    shortcut.value = settings.shortcut; mode.value = settings.outputMode; paste.checked = settings.autoPaste;
    scale.value = String(settings.uiScale); compact.checked = settings.compact;
    const showScale = () => { this.element.querySelector('output')!.textContent = `${scale.value}%`; };
    const preview = () => { showScale(); this.preview?.({ uiScale: Number(scale.value), compact: compact.checked }); };
    showScale(); scale.addEventListener('input', preview); compact.addEventListener('change', preview);
    this.element.querySelector('#settings-cancel')!.addEventListener('click', () => { this.preview?.(settings); this.element.hidden = true; this.element.dispatchEvent(new Event('settings-saved')); });
    aliases.value = Object.entries(settings.aliases).map(([id, names]) => `${id}=${names.join(',')}`).join('\n');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = this.element.querySelector('#settings-error')!;
      try { await this.save(parseSettings(shortcut.value, mode.value, paste.checked, aliases.value, this.ids, Number(scale.value), compact.checked)); this.element.hidden = true; this.element.dispatchEvent(new Event('settings-saved')); }
      catch (reason) { error.textContent = reason instanceof Error ? reason.message : String(reason); }
    });
  }
}
