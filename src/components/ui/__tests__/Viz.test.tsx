/**
 * Data visuals (W-9 §3.2): a ring past its target is simply full, with the real value in words and
 * no warning colour; the mini chart is described in one sentence.
 */
import { render, screen } from '@testing-library/react-native';

import { palette } from '@/theme';

import { MiniBars, ProgressRing } from '../Viz';

const strokes = (json: unknown): string[] => {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as { props?: { style?: unknown }; children?: unknown };
    const flat = [n.props?.style].flat(Infinity) as Record<string, unknown>[];
    for (const s of flat) for (const k of ['borderLeftColor', 'borderRightColor']) if (s?.[k]) out.push(String(s[k]));
    walk(n.children);
  };
  walk(json);
  return out;
};

describe('ProgressRing', () => {
  it('past the target: full ring, the real value read out, no warning colour', async () => {
    const label = '112 g sur 109 g de protéines';
    await render(<ProgressRing value={112 / 109} color="nutrition" label={label} />);
    const ring = screen.getByRole('progressbar', { name: label });
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100, text: label });
    const used = strokes(screen.toJSON());
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((c) => c === palette.light.nutrition)).toBe(true);
    expect(used).not.toContain(palette.light.danger);
    expect(used).not.toContain(palette.light.warning);
  });

  it('empty and partial values keep their real percentage', async () => {
    await render(<ProgressRing value={46 / 140} label="46 g sur 140 g" />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(33);
  });
});

describe('MiniBars', () => {
  it('is one described image', async () => {
    await render(<MiniBars values={[6000, null, 4000]} label="Pas des 7 derniers jours" />);
    expect(screen.getByRole('image', { name: 'Pas des 7 derniers jours' })).toBeTruthy();
  });
});
