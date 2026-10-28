import { MathfieldElement } from 'mathlive';

MathfieldElement.fontsDirectory = '/mathlive/fonts';
MathfieldElement.soundsDirectory = null;
MathfieldElement.locale = 'zh-CN';

export function createMathfield(): MathfieldElement {
  const field = new MathfieldElement({
    mathVirtualKeyboardPolicy: 'manual',
    inlineShortcuts: {},
    smartMode: false,
    smartSuperscript: false,
  });
  field.id = 'math-editor';
  field.setAttribute('aria-label', '数学公式编辑器');
  field.setAttribute('popover-policy', 'off');
  return field;
}
