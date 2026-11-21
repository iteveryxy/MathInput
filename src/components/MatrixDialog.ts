import { MATRIX_FORMS, MAX_MATRIX_CELLS, matrixSnippet } from '../snippets/MatrixSnippet';
import type { MathEditor } from '../editor/MathEditor';
import { localizeUi, t, tr } from '../platform/Language';

export class MatrixDialog {
  readonly element = document.createElement('dialog');
  private readonly rows: HTMLInputElement;
  private readonly columns: HTMLInputElement;

  constructor(private readonly editor: MathEditor) {
    const dialog = this.element;
    dialog.className = 'matrix-dialog';
    dialog.setAttribute('aria-labelledby', 'matrix-title');
    dialog.innerHTML = `
      <form>
        <h2 id="matrix-title">插入矩阵</h2>
        <div class="matrix-dimensions">
          <label>行数<input name="rows" type="number" min="1" max="${MAX_MATRIX_CELLS}" step="1" value="2" required autofocus></label>
          <label>列数<input name="columns" type="number" min="1" max="${MAX_MATRIX_CELLS}" step="1" value="2" required></label>
          <label>样式<select name="form"></select></label>
        </div>
        <p class="matrix-help"></p>
        <p class="matrix-error error" role="alert" hidden></p>
        <div class="matrix-actions"><button type="button">取消</button><button type="submit" class="primary">插入</button></div>
      </form>`;
    const form = dialog.querySelector('form')!;
    this.rows = form.querySelector('input[name="rows"]')!;
    this.columns = form.querySelector('input[name="columns"]')!;
    const style = form.querySelector('select')!;
    for (const [value, { label }] of Object.entries(MATRIX_FORMS)) style.add(new Option(label, value));
    const error = dialog.querySelector<HTMLElement>('.matrix-error')!;
    form.addEventListener('input', () => { error.hidden = true; });
    const cancel = () => { dialog.close(); editor.focus(); };
    form.querySelector('button[type="button"]')!.addEventListener('click', cancel);
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
    this.updateLanguage();
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const snippet = matrixSnippet(this.rows.valueAsNumber, this.columns.valueAsNumber, style.value);
        dialog.close();
        editor.accept(snippet);
      } catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : String(cause);
        error.hidden = false;
      }
    });
  }

  updateLanguage(): void {
    localizeUi(this.element);
    this.element.querySelector('.matrix-help')!.textContent = tr(
      `最多 ${MAX_MATRIX_CELLS} 个单元格。插入后按 Tab 逐格填写。`,
      `Up to ${MAX_MATRIX_CELLS} cells. Press Tab to edit each cell.`,
    );
    const style = this.element.querySelector('select')!;
    for (const option of style.options) option.text = t(MATRIX_FORMS[option.value as keyof typeof MATRIX_FORMS].label);
  }

  open(): void {
    if (this.editor.composing || this.element.open) return;
    this.editor.closeCompletion();
    this.element.querySelector<HTMLElement>('.matrix-error')!.hidden = true;
    this.element.showModal();
    this.rows.select();
  }
}
