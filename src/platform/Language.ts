import english from './en.json';

export type UiLanguage = 'zh-CN' | 'en';
const labels: Readonly<Record<string, string>> = english;
let language: UiLanguage = 'zh-CN';

export function setUiLanguage(value: UiLanguage): void { language = value; }
export function uiLanguage(): UiLanguage { return language; }
export function tr(chinese: string, englishText: string): string { return language === 'en' ? englishText : chinese; }
export function t(chinese: string): string { return tr(chinese, Object.hasOwn(labels, chinese) ? labels[chinese] : chinese); }
export function translatedError(message: string): string {
    if (language === 'zh-CN') return message;
    if (Object.hasOwn(labels, message)) return labels[message];
    const match = /^(\$[^:]*:\s*)(.*)$/.exec(message);
    if (match) return match[1] + t(match[2]);
    const separator = message.indexOf('：');
    const heading = message.slice(0, separator);
    return separator >= 0 && Object.hasOwn(labels, heading)
        ? labels[heading] + ': ' + message.slice(separator + 1)
        : message;
}

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();

// Use only on static UI markup. Names and descriptions authored in formula
// packs are data and are displayed verbatim.
export function localizeUi(root: Element): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const original = originalText.get(node) ?? node.data;
        const label = original.trim();
        if (!Object.hasOwn(labels, label)) continue;
        originalText.set(node, original);
        node.data = original.replace(label, () => t(label));
    }
    for (const element of [root, ...root.querySelectorAll('[title], [aria-label]')]) {
        const originals = originalAttributes.get(element) ?? new Map<string, string>();
        for (const attribute of ['title', 'aria-label']) {
            const label = originals.get(attribute) ?? element.getAttribute(attribute);
            if (label === null || !Object.hasOwn(labels, label)) continue;
            originals.set(attribute, label);
            originalAttributes.set(element, originals);
            element.setAttribute(attribute, t(label));
        }
    }
}
