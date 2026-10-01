import en from '../../../i18n/locales/en';
import fr from '../../../i18n/locales/fr';
import { localeToneFindings, TONE_EXCLUSIONS, toneIssues } from '../voice/tone';

/**
 * Tone guard (D-029): every user-visible string of every locale, at any depth, is checked. Runs in
 * the normal Jest suite (`npm test`, CI job "Lint, typecheck, test, build").
 */
const LOCALES = [
  ['fr', fr],
  ['en', en],
] as const;

const leafCount = (node: unknown): number =>
  typeof node === 'string'
    ? 1
    : node && typeof node === 'object'
      ? Object.values(node).reduce((n: number, v) => n + leafCount(v), 0)
      : 0;

describe('tone guard: every locale string', () => {
  it.each(LOCALES)('no %s string blames, pressures, dramatises, sounds clinical or states an estimate', (_, locale) => {
    const { checked, findings } = localeToneFindings(locale);
    expect(findings).toEqual([]);
    // Nothing is skipped silently: every leaf is checked except the documented exclusions.
    expect(checked).toBe(leafCount(locale) - Object.keys(TONE_EXCLUSIONS).length);
    expect(checked).toBeGreaterThan(1000);
  });

  it('FR and EN are protected the same way: a bad string in either language fails', () => {
    for (const [, locale] of LOCALES) {
      const tampered = { ...locale, daily: { ...locale.daily, extra: 'Tu n’as fait que 2 séances. You only did 2.' } };
      expect(localeToneFindings(tampered).findings.map((f) => f.key)).toEqual(['daily.extra']);
    }
  });

  it('walks the tree recursively: a new section at any depth is covered without a list to update', () => {
    const tree = {
      brandNew: { deep: { deeper: { text: 'Il faut te reprendre.' } }, fine: 'Une séance courte compte.' },
      list: ['Encore une séance manquée.'],
    };
    const { checked, findings } = localeToneFindings(tree, {});
    expect(checked).toBe(3);
    expect(findings.map((f) => f.key)).toEqual(['brandNew.deep.deeper.text', 'list.0']);
  });

  it('an explicit exclusion is skipped, and only that one', () => {
    const tree = { debug: { label: 'Il faut rattraper' }, shown: 'Il faut rattraper' };
    const { checked, findings } = localeToneFindings(tree, { 'debug.label': 'never shown: developer label' });
    expect(checked).toBe(1);
    expect(findings.map((f) => f.key)).toEqual(['shown']);
  });

  it('the exclusion list stays short, justified and current', () => {
    const entries = Object.entries(TONE_EXCLUSIONS);
    expect(entries.length).toBeLessThanOrEqual(10);
    for (const [key, reason] of entries) {
      expect(reason.trim().length).toBeGreaterThan(10);
      const exists = LOCALES.every(([, locale]) =>
        key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], locale),
      );
      expect(exists).toBe(true);
    }
  });
});

describe('tone guard: rules, both ways', () => {
  it.each([
    // Reproach, injunction, pressure.
    'Tu n’as pas fait ta séance hier.',
    'Tu n’as fait que 2 séances.',
    'Tu as encore raté.',
    'Encore une séance manquée.',
    'Tu dois te reprendre.',
    'Il faut te reprendre en main.',
    'Il faut rattraper la séance de lundi.',
    'Il faut faire plus.',
    'Tu vas devoir compenser demain.',
    'Pas d’excuse aujourd’hui !!',
    'Ne sois pas paresseux.',
    'C’est un échec.',
    'Tu devrais avoir honte.',
    'Ta semaine est une catastrophe.',
    'Ne pense pas à abandonner maintenant.',
    // Clinical words, unmeasured estimates.
    'Tu risques une carence.',
    'Attention au surentraînement.',
    'Cela ressemble à un trouble alimentaire.',
    'Tu as perdu 1 kg de masse grasse.',
    'Séance terminée : 450 calories brûlées.',
    // English, same level of protection.
    'You missed your workout.',
    'You only did 2 workouts.',
    'You failed again.',
    'You should try harder.',
    'You have to make up for Monday.',
    'Some workouts were not done.',
    'You don’t feel like it.',
    'Don’t give up now.',
    'That was a failure.',
    'This week was a disaster.',
    'Watch out for overtraining.',
    'You gained 1 kg of muscle mass.',
  ])('refuses “%s”', (text) => {
    expect(toneIssues(text).length).toBeGreaterThan(0);
  });

  it.each([
    // Reassuring negations of a forbidden word.
    'Séance sautée : pas de rattrapage, la prochaine reste prévue.',
    'On reprend en douceur, sans rattraper.',
    'On les remonte un peu, sans rien rattraper.',
    'Des repas libres prévus pour tes sorties, sans « compenser » le lendemain.',
    'C’est une victoire, pas un échec.',
    'Des rappels utiles, jamais culpabilisants.',
    'Qu’est-ce qui pourrait te faire abandonner ?',
    'Tu as manqué de temps cette semaine.',
    // A requirement of the calculation, not an injunction to the user.
    'Encore trop tôt pour comparer : il faut des pesées sur plus d’une semaine.',
    'Il faut 2 semaines de données.',
    // Neutral facts are allowed: hiding them would not help.
    '2 séances sur 3 ont été réalisées cette semaine.',
    'Deux séances non faites deux semaines de suite : un rythme un peu plus léger tient mieux.',
    'Une séance courte compte.',
    'Le repos fait partie du programme.',
    'Parles-en à un professionnel de santé.',
    'That is a win, not a failure.',
    'Useful reminders, never guilt.',
    'What could make you give up?',
    'Add what you have to get recipes that use it first.',
    'The export failed. Please try again.',
    '2 of 3 workouts were done this week.',
  ])('accepts “%s”', (text) => {
    expect(toneIssues(text)).toEqual([]);
  });

  it('a reassurance does not hide a reproach in the same sentence', () => {
    expect(toneIssues('Pas de rattrapage, mais il faut rattraper demain.').length).toBeGreaterThan(0);
    expect(toneIssues('Pas un échec, mais tu n’as pas fait ta séance.').length).toBeGreaterThan(0);
    expect(toneIssues('Never guilt, but you missed it.').length).toBeGreaterThan(0);
  });
});

describe('tone guard: the two reworded strings', () => {
  it('shorter sessions: describes the gap between plan and pace, without counting what was not done', () => {
    expect(fr.adaptation.reason.shorter_sessions).not.toMatch(/n’a pas été faite|pas fait/);
    expect(en.adaptation.reason.shorter_sessions).not.toMatch(/not done/);
    expect(fr.adaptation.reason.shorter_sessions).toMatch(/deux dernières semaines/);
    expect(en.adaptation.reason.shorter_sessions).toMatch(/last two weeks/);
    // A possibility, never a claim the data cannot prove.
    expect(fr.adaptation.reason.shorter_sessions).toMatch(/peuvent/);
    expect(en.adaptation.reason.shorter_sessions).toMatch(/can make/);
  });

  it('low motivation: answers the choice without repeating a negative feeling', () => {
    expect(fr.explain.workout.low_motivation).not.toMatch(/pas envie|motivation/i);
    expect(en.explain.workout.low_motivation).not.toMatch(/feel like|motivation/i);
    for (const text of [fr.explain.workout.low_motivation, en.explain.workout.low_motivation]) {
      expect(toneIssues(text)).toEqual([]);
    }
  });
});
