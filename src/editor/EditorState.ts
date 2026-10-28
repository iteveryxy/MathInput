export interface EditingContext { composing: boolean; completion: boolean; snippet: boolean }
export type EnterAction = 'ime' | 'accept-completion' | 'wrap-completion' | 'finish-snippet' | 'submit';

export function dispatchEnter(context: EditingContext, shift: boolean): EnterAction {
  if (context.composing) return 'ime';
  if (context.completion) return shift ? 'wrap-completion' : 'accept-completion';
  if (context.snippet) return 'finish-snippet';
  return 'submit';
}
