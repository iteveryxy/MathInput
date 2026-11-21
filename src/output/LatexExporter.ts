import type { MathfieldElement } from 'mathlive';
import { joinLatex } from './TexTokens';

/** Strip editing metadata by reading TeX groups, including arbitrarily nested prompts.
 * We preserve all other commands and braces verbatim. This is deliberately not a
 * regex that would truncate nested fractions or superscripts.
 */
export function stripPrompts(latex: string): string {
  let i = 0;
  function read(untilBrace = false): string {
    let result = '';
    while (i < latex.length) {
      const char = latex[i];
      if (char === '}' && untilBrace) { i++; return result; }
      if (char === '{') { i++; result += `{${read(true)}}`; continue; }
      if (char !== '\\') { result = joinLatex(result,char); i++; continue; }
      const start = i++;
      if (/[a-zA-Z]/.test(latex[i] ?? '')) while (/[a-zA-Z]/.test(latex[i] ?? '')) i++;
      else if (i < latex.length) i++;
      const command = latex.slice(start, i);
      if (command !== '\\placeholder') { result += command; continue; }
      while (/\s/.test(latex[i] ?? '') && i < latex.length) i++;
      if (latex[i] === '[') {
        const closing = latex.indexOf(']', i + 1);
        if (closing < 0) throw new Error('占位符标识不完整');
        i = closing + 1;
      }
      while (/\s/.test(latex[i] ?? '') && i < latex.length) i++;
      if (latex[i] !== '{') throw new Error('占位参数缺少内容组');
      i++;
      result = joinLatex(result,read(true));
    }
    if (untilBrace) throw new Error('公式括号不完整');
    return result;
  }
  return read().trim();
}

export function exportLatex(field: MathfieldElement): string {
  return stripPrompts(field.getValue('latex-expanded'));
}
