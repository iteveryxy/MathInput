export interface SnippetParameter {
  id: string;
  name: string;
  description: string;
  defaultValue: string;
}

export interface Snippet {
  id: string;
  command: string;
  aliases: string[];
  name: string;
  description: string;
  /** Named slots: {{parameterId}}. Order is declared by parameters. */
  latex: string;
  parameters: SnippetParameter[];
  wrapTarget?: string;
  preferSelection?: boolean;
  /** Runtime source metadata; never serialized into a Formula Pack. */
  packId?: string;
  packName?: string;
}
