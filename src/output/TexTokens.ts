/** A removed Prompt boundary must not concatenate a TeX control word and letters. */
export function joinLatex(left: string, right: string): string {
    return left + (/(^|[^\\])(?:\\\\)*\\[a-zA-Z]+$/.test(left) && /^[a-zA-Z]/.test(right) ? ' ' : '') + right;
}
