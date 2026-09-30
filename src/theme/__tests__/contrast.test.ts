import { contrastRatio } from '../contrast';
import { palette } from '../tokens';

describe('design tokens contrast (WCAG AA)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const c = palette[scheme];
    it(`${scheme}: text is readable on every surface`, () => {
      for (const bg of [c.background, c.surface, c.surfaceMuted]) {
        expect(contrastRatio(c.text, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(c.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${scheme}: primary button label and status colours are readable`, () => {
      expect(contrastRatio(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
      for (const status of [c.primary, c.success, c.warning, c.danger, c.mock]) {
        expect(contrastRatio(status, c.surface)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
