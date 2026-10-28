export type OutputMode = 'inline' | 'block' | 'latex';
export function formatMath(latex: string, mode: OutputMode): string {
  if (!latex.trim()) throw new Error('请先输入公式');
  if (mode === 'latex') return latex;
  if (mode === 'block') return `$$\n${latex}\n$$`;
  return `$${latex}$`;
}
