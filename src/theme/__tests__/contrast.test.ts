import { contrastRatio } from '../contrast';
import { palette } from '../tokens';

const AA = 4.5;

describe('design tokens contrast (WCAG AA)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const c = palette[scheme];
    const surfaces = [c.background, c.surface, c.surfaceRaised, c.surfaceSubtle];

    it(`${scheme}: every text level is readable on every surface`, () => {
      for (const bg of surfaces) {
        for (const fg of [c.textPrimary, c.textSecondary, c.textMuted, c.text]) {
          expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
        }
      }
    });

    it(`${scheme}: labels on filled surfaces are readable`, () => {
      expect(contrastRatio(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.onPrimary, c.primaryPressed)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.onInverse, c.inverse)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.onInverseMuted, c.inverse)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.primary, c.primarySubtle)).toBeGreaterThanOrEqual(AA);
    });

    it(`${scheme}: status and domain colours are readable as text`, () => {
      for (const status of [c.primary, c.success, c.warning, c.danger, c.info, c.mock]) {
        expect(contrastRatio(status, c.surface)).toBeGreaterThanOrEqual(AA);
      }
      for (const domain of [c.training, c.nutrition, c.progress, c.recovery]) {
        expect(contrastRatio(domain, c.surface)).toBeGreaterThanOrEqual(AA);
      }
      // Each tinted surface keeps its own colour readable (safety, success, error notes).
      expect(contrastRatio(c.warning, c.warningSubtle)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.success, c.successSubtle)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.danger, c.dangerSubtle)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.info, c.infoSubtle)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.textPrimary, c.warningSubtle)).toBeGreaterThanOrEqual(AA);
    });
  }
});
