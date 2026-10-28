export type CustomAliases = Record<string, string[]>;

export function normalizeQuery(query: string): string { return query.trim().toLocaleLowerCase('en-US'); }

export function parseAliases(raw: string, commandIds: string[]): CustomAliases {
  const result: CustomAliases = {};
  for (const line of raw.split(/\r?\n/).filter((line) => line.trim())) {
    const [id, aliases, ...extra] = line.split('=');
    if (extra.length || !aliases || !commandIds.includes(id.trim())) throw new Error(`别名格式错误：${line}。请使用 sqrt=gh,genhao`);
    const names = aliases.split(',').map(normalizeQuery).filter(Boolean);
    if (names.some((name) => !/^[a-z][a-z0-9]*$/.test(name))) throw new Error('别名必须以英文字母开头，且只能包含字母和数字');
    result[id.trim()] = [...new Set(names)];
  }
  return result;
}
