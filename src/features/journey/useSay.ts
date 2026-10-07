import { useTranslation } from 'react-i18next';

import type { Copy } from '@/domain/journey/proposal';
import { getExercise } from '@/domain/training/exercises';
import { formatDate, formatNumber } from '@/lib/format';

/**
 * Translates a coach `Copy` (key + params from the domain): numbers in the user's locale, dates
 * spelled out, exercise ids as names, and nested copy keys (`coachDay.*`) translated.
 */
export function useSay(): (c: Copy) => string {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  return (c) =>
    t(
      c.key,
      Object.fromEntries(
        Object.entries(c.params).map(([k, v]) => [
          k,
          typeof v === 'number'
            ? formatNumber(v, lang)
            : k === 'exercise'
              ? (getExercise(v)?.name[lang] ?? v)
              : k === 'date'
                ? formatDate(v, lang)
                : v.startsWith('coachDay.')
                  ? t(v)
                  : v,
        ]),
      ),
    );
}
