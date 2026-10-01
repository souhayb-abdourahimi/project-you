import en from '../locales/en';
import fr from '../locales/fr';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of leaves(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();

describe('locales', () => {
  const frLeaves = leaves(fr as unknown as Tree);
  const enLeaves = leaves(en as unknown as Tree);

  it('have the same keys', () => {
    expect([...enLeaves.keys()].sort()).toEqual([...frLeaves.keys()].sort());
  });

  it('use the same placeholders', () => {
    for (const [key, value] of frLeaves) expect(placeholders(enLeaves.get(key) ?? '')).toEqual(placeholders(value));
  });

  it('have no empty strings', () => {
    for (const [, value] of [...frLeaves, ...enLeaves]) expect(value.trim()).not.toBe('');
  });
});
