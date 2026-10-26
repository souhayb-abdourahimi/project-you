/**
 * Icons are drawings, never characters of a font (D-048): on iPhone Safari the Material Symbols
 * font was not waited for, so its private-use characters showed as squares. These tests keep any
 * icon from depending on a font, a ligature or a character the device might not have.
 */
import { render, screen } from '@testing-library/react-native';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// The web and Android renderer (Jest resolves `./Icon` to the iOS file).
import { Icon } from '../Icon.tsx';
import { ICONS, type IconName } from '../icons';

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

const walk = (node: Node | string | null, visit: (n: Node | string) => void) => {
  if (node === null) return;
  visit(node);
  if (typeof node !== 'string') for (const child of node.children ?? []) walk(child, visit);
};

const SRC = join(__dirname, '../../..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

describe('Icon (web and Android)', () => {
  it.each(Object.keys(ICONS) as IconName[])('%s is a vector drawing with no text in it', async (name) => {
    await render(<Icon name={name} />);
    const tree = screen.toJSON() as Node;
    const types: string[] = [];
    walk(tree, (n) => {
      // A string child would be a character: exactly what turned into a box.
      expect(typeof n).not.toBe('string');
      if (typeof n !== 'string') types.push(n.type);
    });
    expect(types).toContain('RNSVGSvgView');
    expect(types.some((t) => /^RNSVG(Path|Circle|Rect|Line|Polyline|Polygon|Ellipse)$/.test(t))).toBe(true);
    expect(types).not.toContain('Text');
  });

  it('every entry names an explicit component, an SF Symbol and the Android tab-bar name', () => {
    for (const [name, entry] of Object.entries(ICONS)) {
      expect([name, typeof entry.svg]).toEqual([name, expect.stringMatching(/^(function|object)$/)]);
      expect(entry.sf.length).toBeGreaterThan(0);
      expect(entry.md).toMatch(/^[a-z_]+$/);
    }
  });

  it('keeps its size and is hidden from screen readers (the control carries the name)', async () => {
    await render(<Icon name="today" size={22} />);
    const view = screen.getByTestId('icon-today', { includeHiddenElements: true });
    expect(view.props.style).toEqual({ width: 22, height: 22 });
    expect(view.props['aria-hidden']).toBe(true);
  });
});

describe('No icon depends on a font', () => {
  const sources = files(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

  it('no private-use character (icon font glyph) anywhere in the app or its texts', () => {
    const offenders = sources.filter((f) => /[-]/u.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('no icon font is loaded or named', () => {
    const offenders = sources
      .filter((f) => /material-symbols|MaterialSymbols|MaterialIcons|vector-icons|fontFamily:\s*['"]Material/.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('expo-symbols is used only by the native iOS renderer', () => {
    const users = sources
      .filter((f) => /from 'expo-symbols'/.test(f.text) && !/import type \{[^}]*\} from 'expo-symbols'/.test(f.text))
      .map((f) => f.path.replace(SRC, 'src'));
    expect(users).toEqual(['src/components/ui/Icon.ios.tsx']);
  });

  it('the registry draws only lucide vector icons, imported one by one', () => {
    const registry = readFileSync(join(__dirname, '../icons.ts'), 'utf8');
    const imports = [...registry.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports.filter((m) => m !== 'expo-symbols' && m !== 'react').every((m) => m.startsWith('lucide-react-native/icons/'))).toBe(true);
  });
});
