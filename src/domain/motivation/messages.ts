import type { MotivationProfile } from '../profile/schemas';

export interface MotivationMessage {
  /** i18n key; params are interpolated by the UI. */
  key: string;
  params: Record<string, string>;
}

const WITH_WHY = ['motivation.why_reminder', 'motivation.why_small_step', 'motivation.why_today'];
const GENERIC = ['motivation.generic_consistency', 'motivation.generic_small_wins', 'motivation.generic_rest_counts'];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Deterministic daily message built from the user's own words ("Pourquoi as-tu commencé ?").
 * Never guilt-inducing: templates are reviewed in the locale files.
 */
export function dailyMotivation(motivation: MotivationProfile, date: string): MotivationMessage {
  const why = motivation.why?.trim();
  if (why) {
    return { key: WITH_WHY[hash(date) % WITH_WHY.length], params: { why } };
  }
  return { key: GENERIC[hash(date) % GENERIC.length], params: {} };
}
