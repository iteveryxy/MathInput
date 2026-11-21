import type { Snippet, SnippetParameter } from './types';
import { t, tr } from '../platform/Language';

export const MAX_MATRIX_CELLS = 400;

export const MATRIX_FORMS = {
  pmatrix: { label: '圆括号矩阵', left: '(', right: ')' },
  bmatrix: { label: '方括号矩阵', left: '[', right: ']' },
  Bmatrix: { label: '花括号矩阵', left: '\\{', right: '\\}' },
  matrix: { label: '无外框矩阵', left: '', right: '' },
  vmatrix: { label: '行列式', left: '|', right: '|' },
} as const;

export function matrixSnippet(rows: number, columns: number, form: string): Snippet {
  if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns) || rows < 1 || columns < 1) {
    throw new Error(t('行数和列数须为正整数'));
  }
  if (rows * columns > MAX_MATRIX_CELLS) {
    throw new Error(tr(`逐格编辑支持最多 ${MAX_MATRIX_CELLS} 个单元格`, `A matrix can have up to ${MAX_MATRIX_CELLS} editable cells.`));
  }
  if (!Object.hasOwn(MATRIX_FORMS, form)) throw new Error(tr('请选择矩阵样式', 'Choose a matrix style.'));
  if (form === 'vmatrix' && rows !== columns) throw new Error(t('行列式的行数和列数必须相同'));

  const parameters: SnippetParameter[] = [];
  const grid = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => {
    const id = `r${row + 1}c${column + 1}`;
    const name = tr(`第 ${row + 1} 行第 ${column + 1} 列`, `Row ${row + 1}, column ${column + 1}`);
    parameters.push({ id, name, description: name, defaultValue: '0' });
    return `{{${id}}}`;
  }).join('&')).join('\\\\');
  const { label, left, right } = MATRIX_FORMS[form as keyof typeof MATRIX_FORMS];
  const name = `${rows} × ${columns} ${t(label)}`;
  let latex = `\\begin{${form}}${grid}\\end{${form}}`;
  // amsmath's matrix environments default to ten columns.
  if (columns > 10) {
    latex = `\\begin{array}{${'c'.repeat(columns)}}${grid}\\end{array}`;
    if (left) latex = `\\left${left}${latex}\\right${right}`;
  }
  return {
    id: 'matrix-grid', command: 'matrixgrid', aliases: [], name, description: t('按行编辑矩阵单元格'),
    latex, parameters,
  };
}
