import { convertLatexToMarkup } from 'mathlive';
import { createMathfield } from '../editor/MathLiveSetup';
import { renderSnippet } from '../snippets/SnippetRegistry';
import type { FormulaPack } from './types';
import { validateLatexData } from './Validation';
import { tr } from '../platform/Language';
export function checkPackMath(pack: FormulaPack): void {
    const probe = createMathfield();
    probe.readOnly = true;
    probe.hidden = true;
    probe.id = 'pack-validation-probe';
    document.body.append(probe);
    try {
        pack.snippets.forEach((snippet, i) => {
            probe.value = renderSnippet(snippet);
            const errors = probe.errors;
            if (errors.length) {
                const detail = errors.map(error => error.code + (error.arg ? ` (${error.arg})` : '')).join(', ');
                throw new Error(`$.snippets[${i}].latex: ${tr('MathLive 无法解析：', 'MathLive could not parse: ')}${detail}`);
            }
        });
    }
    finally {
        probe.remove();
    }
}
export function renderMathPreview(element: HTMLElement, latex: string): void {
    validateLatexData(latex, '预览');
    const template = document.createElement('template');
    template.innerHTML = convertLatexToMarkup(latex);
    for (const node of template.content.querySelectorAll('*')) {
        if (!['span', 'div', 'svg', 'g', 'path', 'line', 'rect', 'circle', 'polygon', 'polyline'].includes(node.tagName.toLowerCase())) {
            node.remove();
            continue;
        }
        for (const attr of [...node.attributes])
            if (/^on/i.test(attr.name) || ['href', 'src', 'xlink:href', 'srcdoc'].includes(attr.name) || /url\s*\(/i.test(attr.value))
                node.removeAttribute(attr.name);
    }
    element.replaceChildren(template.content);
}
