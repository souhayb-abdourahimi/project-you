/**
 * Tone guard of the coach's voice: wording that blames, pressures, counts what was not done, uses
 * clinical vocabulary (CLAUDE.md rule 8: no diagnosis) or states an unmeasured estimate about the
 * body (rule 7) is refused. Applied by the tests to every coach string, in every locale, so a new
 * variant cannot ship with such a sentence.
 */

/** Whole-word match that also works with accented letters (`\b` does not). */
const word = (source: string) => new RegExp(`(?<![\\p{L}])(?:${source})(?![\\p{L}])`, 'iu');

export const GUILT_PATTERNS: { pattern: RegExp; why: string }[] = [
  { pattern: word("tu n['’]as (?:pas|rien)"), why: 'reproche ce qui n’a pas été fait' },
  { pattern: word('pas (?:fait|faite|faites|été)'), why: 'compte ce qui n’a pas été fait' },
  { pattern: word('(?:rat|manqu|loup)(?:é|ée|és|ées|er)'), why: 'parle d’échec' },
  { pattern: word('échecs?'), why: 'parle d’échec' },
  { pattern: word('honte|coupables?|culpabilis\\p{L}*'), why: 'culpabilise' },
  { pattern: word('déçu\\p{L}*|décevoir|décevant\\p{L}*'), why: 'culpabilise' },
  { pattern: word('paresse\\p{L}*|paresseu\\p{L}*|fainéant\\p{L}*|flemme'), why: 'juge la personne' },
  { pattern: word('excuses?|rattrap\\p{L}*|compenser|dernière chance'), why: 'met la pression' },
  { pattern: word('tu dois|il faut|obligatoire'), why: 'impose au lieu de proposer' },
  { pattern: word('abandon\\p{L}*'), why: 'parle d’abandon' },
  { pattern: word("you didn['’]t|you haven['’]t|you failed"), why: 'blames' },
  { pattern: word('missed|fail\\p{L}*|lazy|guilt\\p{L}*|shame\\p{L}*|disappoint\\p{L}*'), why: 'blames' },
  { pattern: word('you must|you should|have to|no excuses?|last chance|make up for|give up'), why: 'pressures' },
  { pattern: /!{2,}/, why: 'crie' },
];

/** Diagnosis-like or clinical words: the app is not a health professional. */
export const CLINICAL_PATTERNS: { pattern: RegExp; why: string }[] = [
  { pattern: word('troubles?|tca|anorexi\\p{L}*|boulimi\\p{L}*|orthorexi\\p{L}*'), why: 'vocabulaire clinique' },
  {
    pattern: word('carences?|dénutri\\p{L}*|malnutri\\p{L}*|surentraînement|pathologi\\p{L}*|symptômes?'),
    why: 'vocabulaire clinique',
  },
  { pattern: word('diagnosti\\p{L}*|maladie|syndrome|dépression|addiction'), why: 'vocabulaire clinique' },
  {
    pattern: word(
      'eating disorders?|anorexia|bulimia|deficienc\\p{L}*|malnutrition|overtraining|symptoms?|diagnos\\p{L}*|disease|patholog\\p{L}*',
    ),
    why: 'clinical vocabulary',
  },
];

/** Estimates about the body the app cannot measure (CLAUDE.md rule 7). */
export const ESTIMATE_PATTERNS: { pattern: RegExp; why: string }[] = [
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
    .filter((g) => g.pattern.test(text))
    .map((g) => g.why);
}
