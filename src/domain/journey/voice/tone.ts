/**
 * Tone guard of the coach's voice: wording that blames, pressures, counts what was not done, uses
 * clinical vocabulary (CLAUDE.md rule 8: no diagnosis) or states an unmeasured estimate about the
 * body (rule 7) is refused. Applied by the tests to every user-visible string of every locale (FR
 * and EN, whole tree, D-029), so a new string cannot ship with such a sentence.
 */

/** Whole-word match that also works with accented letters (`\b` does not). */
const word = (source: string) => new RegExp(`(?<![\\p{L}])(?:${source})(?![\\p{L}])`, 'iu');

export interface ToneRule {
  pattern: RegExp;
  why: string;
  /**
   * Reassuring forms of the same words, removed before the pattern is tested ("sans rattraper",
   * "pas un échec", "jamais culpabilisant"). Each one is narrow and tested both ways: the
   * reassurance passes, the injunction or reproach with the same word is still refused.
   */
  allow?: RegExp[];
}

const phrase = (source: string) => new RegExp(`(?<![\\p{L}])(?:${source})(?![\\p{L}])`, 'giu');

/**
 * Blame, pressure, humiliation, drama, moral judgment. A neutral fact is fine ("2 séances sur 3
 * ont été réalisées cette semaine") ; a reproach is not ("Tu n'as fait que 2 séances").
 */
export const GUILT_PATTERNS: ToneRule[] = [
  { pattern: word("tu n['’]as (?:pas|rien)"), why: 'reproche ce qui n’a pas été fait' },
  { pattern: word("tu n['’]as \\p{L}+ que|tu n['’]as que"), why: 'minimise ce qui a été fait' },
  { pattern: word('pas (?:fait|faite|faites|été)'), why: 'compte ce qui n’a pas été fait' },
  {
    pattern: word('(?:rat|manqu|loup)(?:é|ée|és|ées|er)'),
    why: 'parle d’échec',
    // "Tu as manqué de temps" : the problem the user picked in the check-in, not a missed session.
    allow: [phrase('manqu(?:é|er) de temps')],
  },
  { pattern: word('échecs?'), why: 'parle d’échec', allow: [phrase('(?:pas|jamais) un échec')] },
  {
    pattern: word('honte|coupables?|culpabilis\\p{L}*'),
    why: 'culpabilise',
    allow: [phrase('(?:jamais|sans|ne \\p{L}+ jamais) culpabilis\\p{L}*')],
  },
  { pattern: word('déçu\\p{L}*|décevoir|décevant\\p{L}*'), why: 'culpabilise' },
  { pattern: word('paresse\\p{L}*|paresseu\\p{L}*|fainéant\\p{L}*|flemme'), why: 'juge la personne' },
  { pattern: word('catastroph\\p{L}*|désastr\\p{L}*|alarmant\\p{L}*'), why: 'dramatise' },
  {
    pattern: word('excuses?|rattrap\\p{L}*|compenser|dernière chance'),
    why: 'met la pression',
    // "Pas de rattrapage", "sans rien rattraper", "sans « compenser »" : the coach says there is
    // nothing to make up for. "Il faut rattraper" is still refused.
    allow: [
      phrase('(?:pas de|aucun|jamais de|sans) rattrapage'),
      phrase('sans (?:rien )?(?:«\\s?)?(?:rattraper|compenser)(?:\\s?»)?'),
    ],
  },
  {
    // An injunction to the user: "il faut" + a verb or a pronoun. "Il faut des pesées sur plus
    // d'une semaine" states what the calculation needs and is allowed.
    pattern: word("tu dois|obligatoire|il faut(?!\\s+(?:des|du|de|d['’]|un|une|le|la|les|l['’]|au moins|\\d))"),
    why: 'impose au lieu de proposer',
  },
  {
    pattern: word('abandon\\p{L}*'),
    why: 'parle d’abandon',
    // The onboarding question that asks the user what could get in their way.
    allow: [phrase('pourrait te faire abandonner')],
  },
  {
    pattern: word("you didn['’]t|you haven['’]t|you don['’]t|you (?:have |['’]ve )?failed|you only"),
    why: 'blames',
  },
  { pattern: word("(?:were|was) not done|(?:weren|wasn)['’]t done"), why: 'counts what was not done' },
  {
    pattern: word('missed|failures?|failing|lazy|guilt\\p{L}*|shame\\p{L}*|disappoint\\p{L}*'),
    why: 'blames',
    allow: [phrase('(?:not|never) a failure'), phrase('never guilt\\p{L}*')],
  },
  { pattern: word('catastroph\\p{L}*|disaster\\p{L}*|alarming|pathetic'), why: 'dramatises' },
  {
    pattern: word(
      "you must|you should|(?<!what )you have to|you['’]ve got to|no excuses?|last chance|make up for|give up",
    ),
    why: 'pressures',
    allow: [phrase('could make you give up'), phrase('nothing to make up for')],
  },
  { pattern: /!{2,}/, why: 'crie' },
];

/** Diagnosis-like or clinical words: the app is not a health professional. */
export const CLINICAL_PATTERNS: ToneRule[] = [
  { pattern: word('troubles?|tca|anorexi\\p{L}*|boulimi\\p{L}*|orthorexi\\p{L}*'), why: 'vocabulaire clinique' },
  {
    pattern: word('carences?|dénutri\\p{L}*|malnutri\\p{L}*|surentraînement|pathologi\\p{L}*|symptômes?'),
    why: 'vocabulaire clinique',
  },
  { pattern: word('diagnosti\\p{L}*|maladie|syndrome|dépression|addiction'), why: 'vocabulaire clinique' },
  {
    // A movement that bothered is a question, never a diagnosis (D-037 §10): "Tu as une blessure."
    pattern: word(
      "tu (?:as|aurais) (?:une |des )?bless\\p{L}*|tu (?:es|t['’]es) bless\\p{L}*|you(?:['’]re| are| were) injured|you have (?:an |a )?injur\\p{L}*",
    ),
    why: 'diagnostic',
  },
  {
    pattern: word(
      'eating disorders?|anorexia|bulimia|deficienc\\p{L}*|malnutrition|overtraining|symptoms?|diagnos\\p{L}*|disease|patholog\\p{L}*',
    ),
    why: 'clinical vocabulary',
  },
];

/** Estimates about the body the app cannot measure (CLAUDE.md rule 7). */
export const ESTIMATE_PATTERNS: ToneRule[] = [
  {
    pattern: word(
      'masse (?:musculaire|grasse|maigre)|calories brûlées|kcal brûlées|taux de graisse|% de graisse|graisse perdue|muscle gagné',
    ),
    why: 'estimation non mesurée',
  },
  {
    pattern: word('muscle mass|fat mass|lean mass|body fat|calories burned|fat lost|muscle gained'),
    why: 'unmeasured estimate',
  },
];

/** Every reason the text breaks the coach's tone (empty = fine). */
export function toneIssues(text: string): string[] {
  return [...GUILT_PATTERNS, ...CLINICAL_PATTERNS, ...ESTIMATE_PATTERNS]
    .filter((rule) => {
      const rest = (rule.allow ?? []).reduce((t, allowed) => t.replace(allowed, ' '), text);
      return rule.pattern.test(rest);
    })
    .map((rule) => rule.why);
}

/**
 * Locale keys never shown to the user, so not checked. Keep it short, each entry with its reason;
 * a test fails if an entry no longer exists. Everything else in the locales is checked.
 */
export const TONE_EXCLUSIONS: Record<string, string> = {};

export interface ToneFinding {
  key: string;
  text: string;
  issues: string[];
}

/**
 * Walks a whole locale tree (any depth): every string leaf is checked unless excluded, so a new
 * section added to the locales is covered without touching this list.
 */
export function localeToneFindings(
  tree: unknown,
  exclusions: Record<string, string> = TONE_EXCLUSIONS,
  prefix = '',
): { checked: number; findings: ToneFinding[] } {
  let checked = 0;
  const findings: ToneFinding[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') {
      if (path in exclusions) return;
      checked += 1;
      const issues = toneIssues(node);
      if (issues.length > 0) findings.push({ key: path, text: node, issues });
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(tree, prefix);
  return { checked, findings };
}
