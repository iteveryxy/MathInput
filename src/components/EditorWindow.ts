import { MathEditor } from '../editor/MathEditor';
import { CompletionPopup } from '../completion/CompletionPopup';
import { ParameterTooltip } from './ParameterTooltip';
import { SettingsPanel } from './SettingsPanel';
import { DesktopBridge } from '../platform/DesktopBridge';
import { DRAFT_KEY, RESULT_KEY, loadSettings, saveSettings, type Settings } from '../platform/Settings';
import { formatMath, type OutputMode } from '../output/MarkdownFormatter';
import { revealCaret } from '../editor/CaretAnchor';
import { FormulaPackService } from '../packs/FormulaPackService';
import { FormulaPackManager } from './FormulaPackManager';
import { candidateId, snippetKey } from '../packs/types';
import { checkPackMath } from '../packs/MathPreview';
import { MatrixDialog } from './MatrixDialog';

export class EditorWindow {
  readonly editor: MathEditor;
  private readonly bridge = new DesktopBridge();
  private readonly popup: CompletionPopup;
  private readonly tooltip = new ParameterTooltip();
  private readonly settingsPanel: SettingsPanel;
  private readonly matrixDialog: MatrixDialog;
  private settings = loadSettings();
  private busy = false;
  private fitTimer?: ReturnType<typeof setTimeout>;
  readonly packs=new FormulaPackService(undefined,checkPackMath);
  private readonly packManager:FormulaPackManager;

  constructor(private readonly root: HTMLDivElement) {
    document.body.classList.toggle('desktop', this.bridge.desktop);
    this.applyAppearance(this.settings);
    this.root.className = 'shell';
    this.root.innerHTML = `
      <header class="titlebar">
        <div class="brand"><img src="/icon.svg" alt="" width="32" height="32"><div><strong>Math Input</strong><span>把想法，写成公式</span></div><span class="offline"><i></i>离线</span></div>
        <div class="window-actions"><span class="shortcut-badge" id="shortcut-badge">Ctrl Alt M</span><button id="help-button" class="icon-button" aria-label="快捷键帮助" title="快捷键帮助">?</button><button id="settings-button" class="icon-button" aria-label="设置" title="设置">⚙</button><button id="close-button" class="icon-button" aria-label="取消输入" title="Esc 取消">×</button></div>
      </header>
      <main class="editor-main">
        <div class="editor-label"><label for="math-editor">数学表达式</label><button id="matrix-button" class="text-button" title="Alt + M" aria-haspopup="dialog">矩阵</button><button id="commands-button" class="text-button">命令 <kbd>Ctrl Space</kbd></button></div>
        <div id="editor-container" class="editor-container"><div id="empty-hint" class="empty-hint"><span>从一个公式开始</span><small>输入 sqrt、frac、sum，或直接书写数学表达式</small></div></div>
        <div id="parameter-container"></div>
        <div class="output-line"><div class="output-label">输出</div><code id="output-preview" aria-label="生成的公式"></code><select id="output-mode" aria-label="输出格式"><option value="inline">$…$ 行内</option><option value="block">$$…$$ 块级</option><option value="latex">LaTeX</option></select></div>
      </main>
      <div id="popup-container"></div>
      <footer class="footer"><div id="key-hint" class="key-hint"></div><div class="submit-actions"><button id="copy-button" title="用生成的公式替换剪贴板">仅复制</button><button id="submit-button" class="primary">插入公式 <kbd>↵</kbd></button></div></footer>
      <div id="status" class="status" role="status" aria-live="polite"></div>
      <details id="last-result" class="last-result" hidden><summary>上次生成结果</summary><textarea readonly aria-label="上次生成结果" rows="2"></textarea></details>
      <section id="help-panel" class="help-panel" hidden><div class="panel-title">键盘操作 <span>鼠标可直接定位数学光标</span></div><dl><dt>↑ / ↓</dt><dd>选择补全候选，继续打字仍可筛选</dd><dt>Enter</dt><dd>接受候选 → 完成当前模板 → 提交公式</dd><dt>Shift + Enter</dt><dd>候选打开时，包裹选区或左侧数学项</dd><dt>Tab / Shift + Tab</dt><dd>下一个 / 上一个参数，未改动时保留默认值</dd><dt>Ctrl + ← / →</dt><dd>跨过当前层级的数学项</dd><dt>Ctrl + Shift + ← / →</dt><dd>按方向扩展结构选区，反向收缩</dd><dt>Alt + ← / →</dt><dd>跳出最近数学容器，阻止页面导航</dd><dt>Ctrl + Backspace / Delete</dt><dd>删除相邻数学项</dd><dt>Ctrl + M</dt><dd>跳转到匹配括号</dd><dt>Ctrl + Alt + U</dt><dd>解除安全的函数、根式或括号外壳</dd><dt>Alt + Shift + → / ←</dt><dd>扩展结构选区 / 按原路径收缩</dd><dt>Ctrl + Z / Y</dt><dd>撤销 / 重做；Ctrl + Shift + Z 也可重做</dd><dt>Esc</dt><dd>先关闭候选，再清除结构选区，最后取消；草稿保留</dd></dl><p>自动粘贴会核对原窗口与输入控件。无法确认目标或剪贴板含其他格式时，结果保留供手动复制。</p></section>
      <div id="settings-container"></div>`;

    this.editor = new MathEditor({ change: () => this.render(), submit: () => { void this.submit(false); }, cancel: () => { void this.cancel(); }, error: (message) => this.status(message, true) });
    this.root.querySelector('#editor-container')!.append(this.editor.field);
    this.matrixDialog = new MatrixDialog(this.editor);
    this.root.append(this.matrixDialog.element);
    this.editor.field.menuItems = [];
    this.popup = new CompletionPopup((snippet, wrap) => this.editor.accept(snippet, wrap), this.editor.field);
    this.settingsPanel = new SettingsPanel(async (settings) => this.save(settings), ()=>this.packs.snippets(true).map(snippetKey), settings => this.applyAppearance(settings));
    this.root.querySelector('#parameter-container')!.append(this.tooltip.element);
    this.root.querySelector('#settings-container')!.append(this.settingsPanel.element);
    this.settingsPanel.element.addEventListener('settings-saved', () => requestAnimationFrame(() => this.editor.focus()));
    this.packManager=new FormulaPackManager(this.packs,()=>this.settings.aliases,()=>this.editor.focus());
    this.root.append(this.packManager.element);
    this.settingsPanel.element.addEventListener('open-formula-packs',()=>{this.editor.closeCompletion();void this.packManager.open();});
    this.packs.changed.add(()=>{this.editor.registry.replace(this.packs.snippets());this.editor.registryChanged();if(this.packs.error)this.status(this.packs.error,true);});
    void this.packs.initialize();
    this.editor.completion.aliases = this.settings.aliases;
    this.bind();
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) this.editor.setLatex(draft);
      const lastResult = localStorage.getItem(RESULT_KEY);
      if (lastResult) this.lastResult(lastResult);
    } catch { this.status('本机存储不可用，请及时复制编辑结果', true); }
    this.render();
    void this.initialize();
  }

  private bind(): void {
    const on = (id: string, callback: () => void) => this.root.querySelector(id)!.addEventListener('click', callback);
    on('#commands-button', () => this.editor.showCommands());
    this.root.querySelector('#matrix-button')!.addEventListener('pointerdown', event => event.preventDefault());
    on('#matrix-button', () => this.matrixDialog.open());
    this.editor.field.addEventListener('keydown', event => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing && event.code === 'KeyM') {
        event.preventDefault();
        this.matrixDialog.open();
      }
    }, true);
    on('#close-button', () => { void this.cancel(); });
    on('#copy-button', () => { void this.submit(true); });
    on('#submit-button', () => { void this.submit(false); });
    on('#settings-button', () => { this.settingsPanel.toggle(this.settings); this.applyAppearance(this.settings); this.editor.closeCompletion(); });
    const unwrap = document.createElement('button'); unwrap.id = 'unwrap-button'; unwrap.className = 'text-button'; unwrap.textContent = '解除结构'; unwrap.title = 'Ctrl + Alt + U';
    unwrap.addEventListener('pointerdown', event => event.preventDefault());
    unwrap.addEventListener('click', () => this.editor.unwrap());
    this.root.querySelector('.editor-label')!.append(unwrap);
    const saveTemplate=document.createElement('button');saveTemplate.id='save-template-button';saveTemplate.className='text-button';saveTemplate.textContent='保存为模板';saveTemplate.addEventListener('click',()=>{if(this.editor.latex){this.editor.closeCompletion();void this.packManager.open(this.editor.latex);}else this.status('请先输入需要保存的公式',true);});this.root.querySelector('.editor-label')!.append(saveTemplate);
    document.addEventListener('keydown', event => {
      // Prevent WebView history navigation even when a settings input has focus.
      if (event.altKey && !event.ctrlKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
    }, true);
    on('#help-button', () => { const panel = this.root.querySelector<HTMLElement>('#help-panel')!; panel.hidden = !panel.hidden; });
    this.root.querySelector('#output-mode')!.addEventListener('change', (event) => {
      this.settings.outputMode = (event.target as HTMLSelectElement).value as OutputMode;
      try { saveSettings(this.settings); } catch { this.status('输出格式未能保存到本机', true); }
      this.render();
    });
    this.root.querySelector('.titlebar')!.addEventListener('pointerdown', (event) => {
      if (!(event.target as HTMLElement).closest('button, select, input') && (event as PointerEvent).button === 0) void this.bridge.drag().catch((error) => this.status(String(error), true));
    });
    new ResizeObserver(() => {
      clearTimeout(this.fitTimer);
      this.fitTimer = setTimeout(() => { void this.bridge.fit(this.root.scrollHeight + 2).catch(() => { /* User resizing may temporarily race this advisory adjustment. */ }); }, 60);
    }).observe(this.root);
  }

  private async initialize(): Promise<void> {
    try {
      await this.bridge.onOpen(() => {
        if (this.matrixDialog.element.open || !this.settingsPanel.element.hidden || !this.packManager.element.hidden) return;
        requestAnimationFrame(() => this.editor.focus());
        void this.bridge.status().then((status) => { if (status.error) this.status(status.error, true); });
      });
      const status = await this.bridge.status();
      if (this.bridge.desktop) {
        this.settings.shortcut = status.shortcut;
        if (status.error) this.status(status.error, true);
      }
      this.render();
    } catch (error) { this.status(String(error), true); }
    requestAnimationFrame(() => this.editor.focus());
  }

  private render(): void {
    if (!this.popup) return; // MathLive can emit its mount event during construction.
    requestAnimationFrame(() => revealCaret(this.editor.field));
    this.popup.render(this.editor.completion.state);
    this.tooltip.render(this.editor.placeholders.stack);
    const completion = this.editor.completion.state;
    this.editor.field.setAttribute('aria-expanded', String(completion.open));
    this.editor.field.setAttribute('aria-controls', 'completion-popup');
    if (completion.open && this.editor.completion.selected) this.editor.field.setAttribute('aria-activedescendant', candidateId(this.editor.completion.selected));
    else this.editor.field.removeAttribute('aria-activedescendant');
    const latex = this.editor.latex;
    this.root.querySelector<HTMLElement>('#empty-hint')!.hidden = !!latex;
    this.root.querySelector('#output-preview')!.textContent = latex ? formatMath(latex, this.settings.outputMode) : '公式将在这里生成';
    (this.root.querySelector('#output-mode') as HTMLSelectElement).value = this.settings.outputMode;
    this.root.querySelector('#shortcut-badge')!.textContent = this.settings.shortcut.replaceAll('+', ' ');
    this.root.querySelector('#key-hint')!.textContent = completion.open ? '↑ ↓ 选择 · Enter 插入 · Shift Enter 包裹' : this.editor.placeholders.stack.depth ? 'Tab 下一个参数 · Enter 完成当前模板' : 'Enter 提交 · Esc 取消';
    for (const id of ['#submit-button', '#copy-button']) (this.root.querySelector(id) as HTMLButtonElement).disabled = !latex || this.busy || this.editor.composing;
    try { localStorage.setItem(DRAFT_KEY, latex); } catch { /* A failed draft save must not discard the live document. */ }
  }

  private async save(settings: Settings): Promise<void> {
    // A shortcut conflict is resolved before committing the new settings.
    await this.bridge.configureShortcut(settings.shortcut);
    saveSettings(settings);
    this.settings = settings;
    this.applyAppearance(settings);
    this.editor.completion.aliases = settings.aliases;
    this.status('设置已保存在本机');
    this.render();
    this.editor.focus();
  }

  private applyAppearance(settings: Pick<Settings, 'uiScale' | 'compact'>): void {
    document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale / 100));
    document.body.classList.toggle('compact', settings.compact);
    this.popup?.schedulePosition(true);
  }

  private status(message: string, error = false): void {
    const element = this.root.querySelector<HTMLElement>('#status')!;
    element.textContent = message;
    element.classList.toggle('error', error);
  }
  private lastResult(text: string): void {
    const element = this.root.querySelector<HTMLDetailsElement>('#last-result')!;
    element.hidden = false;
    element.querySelector('textarea')!.value = text;
  }

  private async submit(copyOnly: boolean): Promise<void> {
    if (this.busy || this.editor.composing) return;
    this.busy = true;
    try {
      const result = formatMath(this.editor.latex, this.settings.outputMode);
      this.lastResult(result);
      // Persist before any window lifecycle or clipboard operation.
      try { localStorage.setItem(RESULT_KEY, result); }
      catch { this.status('结果暂未能持久保存，请使用“仅复制”', true); }
      const outcome = copyOnly ? await this.bridge.copy(result) : await this.bridge.submit(result, this.settings.autoPaste);
      this.editor.closeCompletion();
      this.status(outcome.message, outcome.status === 'manual');
    } catch (error) { this.status(error instanceof Error ? error.message : String(error), true); }
    finally { this.busy = false; this.render(); }
  }

  private async cancel(): Promise<void> {
    this.editor.closeCompletion();
    try { await this.bridge.cancel(); this.status('已取消，草稿保留'); }
    catch (error) { this.status(String(error), true); }
  }
}
