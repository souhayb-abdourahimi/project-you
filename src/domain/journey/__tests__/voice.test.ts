import en from '../../../i18n/locales/en';
import fr from '../../../i18n/locales/fr';
import { leaves, stateFor, translator } from '../__fixtures__/journey';
import { ANCHORS, CATALOG, anchorKey, partKey, type PartKind } from '../voice/catalog';
import { composeMessage, renderMessage, shortQuote } from '../voice/composer';
import { toneIssues } from '../voice/tone';
import { SAFETY_TRIGGERS, TRIGGERS, type AnchorSlot } from '../voice/types';

type Tree = Parameters<typeof leaves>[0];
const coach = (locale: typeof fr | typeof en) => leaves((locale as unknown as { coach: Tree }).coach, 'coach');

/** Same pattern as the `template_id` check in supabase/migrations/20261001000002_notification_engine.sql. */
const SQL_TEMPLATE_ID = /^[a-z_]+\|[a-z0-9_]+\|[a-z]+\.[a-z0-9_]+\|[a-z0-9_]+\|[a-z0-9_]+$/;

describe('coach voice: catalog and locales', () => {
  const catalogKeys = new Set<string>();
  for (const [slot, variants] of Object.entries(ANCHORS)) {
    for (const v of variants) catalogKeys.add(anchorKey(slot as AnchorSlot, v.id));
  }
  for (const trigger of TRIGGERS) {
    for (const kind of ['title', 'action', 'meaning'] as PartKind[]) {
      for (const v of CATALOG[trigger][kind]) catalogKeys.add(partKey(trigger, kind, v.id));
    }
  }

  it.each([
    ['fr', fr],
    ['en', en],
  ] as const)('every catalog variant has a %s string and every %s coach string is used', (_, locale) => {
    const strings = coach(locale);
    expect([...catalogKeys].filter((k) => !strings.has(k))).toEqual([]);
    expect([...strings.keys()].filter((k) => !catalogKeys.has(k))).toEqual([]);
  });

  it.each([
    ['fr', fr],
    ['en', en],
  ] as const)('no %s coach string blames, pressures, sounds clinical or states an estimate', (_, locale) => {
    const bad = [...coach(locale)].map(([k, text]) => [k, toneIssues(text)]).filter(([, issues]) => issues.length > 0);
    expect(bad).toEqual([]);
  });

  it('every trigger can always be worded, whatever the goal, tone and facts', () => {
    const facts: Record<string, string>[] = [
      {},
      { time: '18:00' },
      { time: '18:00', short: '1' },
      { meal: 'Curry' },
      { safety: '1' },
      { below_floor: '1' },
    ];
    for (const trigger of TRIGGERS) {
      for (const goal of ['fat_loss', 'muscle_gain', 'recomposition', 'maintenance', 'performance'] as const) {
        for (const tone of ['gentle', 'direct'] as const) {
          for (const f of facts) {
            const m = composeMessage({
              trigger,
              date: '2026-10-01',
              facts: trigger === 'success_streak' ? { ...f, weeks: '4' } : f,
              state: stateFor({ goal, tone }),
              quotePersonalWords: true,
              history: [],
            });
            expect(m.templateId).toMatch(SQL_TEMPLATE_ID);
          }
        }
      }
    }
  });
});

describe('coach voice: tone guard', () => {
  it.each([
    'Tu n’as pas fait ta séance hier.',
    'Encore une séance manquée.',
    'Il faut te reprendre en main.',
    'Pas d’excuse aujourd’hui !!',
    'Ne sois pas paresseux.',
    'Tu risques une carence.',
    'Attention au surentraînement.',
    'Cela ressemble à un trouble alimentaire.',
    'Tu as perdu 1 kg de masse grasse.',
    'Séance terminée : 450 calories brûlées.',
    'You missed your workout.',
    'You should try harder.',
    'Watch out for overtraining.',
    'You gained 1 kg of muscle mass.',
  ])('refuses “%s”', (text) => {
    expect(toneIssues(text).length).toBeGreaterThan(0);
  });

  it.each([
    'Une séance courte compte.',
    'Le repos fait partie du programme.',
    'Parles-en à un professionnel de santé.',
  ])('accepts “%s”', (text) => {
    expect(toneIssues(text)).toEqual([]);
  });
});

describe('coach voice: composer', () => {
  const t = translator('fr');

  it('quotes the user’s words, cut on a word boundary when long', () => {
    expect(shortQuote('  être   fier de moi ')).toBe('être fier de moi');
    const long =
      'je veux retrouver de l’énergie pour jouer avec mes enfants le week-end sans être essoufflé au bout de dix minutes';
    const cut = shortQuote(long);
    expect(cut.length).toBeLessThanOrEqual(80);
    expect(cut.endsWith('…')).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
  });

  it('safety messages never lean on the goal: neutral anchor, a professional is suggested', () => {
    for (const trigger of SAFETY_TRIGGERS) {
      const m = composeMessage({
        trigger,
        date: '2026-10-01',
        facts: {},
        state: stateFor(),
        quotePersonalWords: true,
        history: [],
      });
      expect(m.anchorSlot).toBe('care');
      const { body } = renderMessage(m, t);
      expect(body).not.toContain('fier de moi');
      expect(body).toMatch(/professionnel de santé/);
    }
  });

  it('says it when logged meals are under the floor', () => {
    const m = composeMessage({
      trigger: 'safety_low_intake',
      date: '2026-10-01',
      facts: { below_floor: '1' },
      state: stateFor(),
      quotePersonalWords: true,
      history: [],
    });
    expect(m.body[1].key).toBe('coach.action.safety_low_intake.floor');
  });

  it('drops goal-pushing meanings while the safety rule is active', () => {
    for (let i = 0; i < 6; i++) {
      const m = composeMessage({
        trigger: 'meal_planned',
        date: `2026-10-0${i + 1}`,
        facts: { safety: '1' },
        state: stateFor({ goal: 'fat_loss' }),
        quotePersonalWords: true,
        history: [],
      });
      expect(m.body[2].key).not.toBe('coach.meaning.meal_planned.lose');
    }
  });
});
