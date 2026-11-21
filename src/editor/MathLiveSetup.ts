import { MathfieldElement } from 'mathlive';
import { t, uiLanguage } from '../platform/Language';

MathfieldElement.fontsDirectory = '/mathlive/fonts';
MathfieldElement.soundsDirectory = null;
export function updateMathfieldLanguage(field: MathfieldElement): void {
  MathfieldElement.locale = uiLanguage();
  field.setAttribute('aria-label', t('数学公式编辑器'));
}

export function createMathfield(): MathfieldElement {
  const field = new MathfieldElement({
    mathVirtualKeyboardPolicy: 'manual',
    inlineShortcuts: {},
    smartMode: false,
    smartSuperscript: false,
  });
  field.id = 'math-editor';
  updateMathfieldLanguage(field);
  field.setAttribute('popover-policy', 'off');
  return field;
}
