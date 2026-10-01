import en from '../../../i18n/locales/en';
import fr from '../../../i18n/locales/fr';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '../../notifications/types';
import type { GoalType } from '../../profile/schemas';
import { daysBetween } from '../../shared/dates';
import { NO_SAFETY_ISSUE, type SafetyAssessment } from '../safety';
import type { JourneyState } from '../state';
import { goalFamily, type Tone } from '../voice/types';

type Tree = { [key: string]: string | Tree };

/** Minimal i18next-like translate over the real locale files (fails on a missing key). */
export function translator(locale: 'fr' | 'en' = 'fr') {
  const tree = (locale === 'fr' ? fr : en) as unknown as Tree;
  return (key: string, params: Record<string, string> = {}) => {
    const value = key
      .split('.')
      .reduce<string | Tree | undefined>((node, k) => (node && typeof node === 'object' ? node[k] : undefined), tree);
    if (typeof value !== 'string') throw new Error(`Missing ${locale} key ${key}`);
    return value.replace(/\{\{(\w+)\}\}/g, (_, k: string) => params[k] ?? `{{${k}}}`);
  };
}

export function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of leaves(value, path)) out.set(k, v);
  }
  return out;
}

export const allPrefsOn = (patch: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  enabled: true,
  maxPerDay: 6,
  categories: {
    training: true,
    meals: true,
    weigh_in: true,
    shopping: true,
    progress: true,
    motivation: true,
    calendar: true,
  },
  ...patch,
});

export interface StatePatch {
  today?: string;
  startedOn?: string;
  comeback?: boolean;
  goal?: GoalType;
  motivation?: JourneyState['motivation'];
  tone?: Tone;
  lastActivityDate?: string | null;
  sessionDates?: string[];
  weeklyStreak?: number;
  sessionsThisWeek?: number;
  weightDirection?: JourneyState['progress']['weightDirection'];
  fatigue?: JourneyState['difficulties']['fatigue'];
  mainMeal?: Record<string, string>;
  safety?: Partial<SafetyAssessment>;
  profile?: Partial<JourneyState['profile']>;
}

/** A journey state for tests, flat overrides (default: fat loss, three answers given, nothing logged). */
export const stateFor = (p: StatePatch = {}): JourneyState => {
  const today = p.today ?? '2026-09-28';
  const goal = p.goal ?? 'fat_loss';
  const safety = { ...NO_SAFETY_ISSUE, ...p.safety };
  return {
    today,
    journey: {
      startedOn: p.startedOn ?? '2026-09-01',
      dayIndex: Math.max(0, daysBetween(p.startedOn ?? '2026-09-01', today)),
      firstDay: (p.startedOn ?? '2026-09-01') >= today,
    },
    goal: { type: goal, family: goalFamily(goal) },
    motivation: p.motivation ?? { why: 'être fier de moi', change: 'avoir plus d’énergie', feel: 'léger et en forme' },
    tone: p.tone ?? 'gentle',
    progress: {
      sessionDates: p.sessionDates ?? [],
      sessionsThisWeek: p.sessionsThisWeek ?? 0,
      weeklyStreak: p.weeklyStreak ?? 0,
      weightDirection: p.weightDirection ?? 'unknown',
    },
    momentum: {
      lastActivityDate: p.lastActivityDate ?? null,
      daysSinceActivity: null,
      previousActivityDate: p.lastActivityDate ?? null,
      comeback: p.comeback ?? false,
    },
    difficulties: { fatigue: p.fatigue ?? 'unknown' },
    profile: { age: 30, weightStatus: 'not_underweight', noPush: false, ...p.profile },
    safety: { ...safety, active: safety.flags.length > 0 },
    plan: { mainMeal: p.mainMeal ?? {} },
  };
};
