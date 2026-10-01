import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { excludedFoods, resolveExclusions } from '@/domain/meals/exclusions';
import { spacing } from '@/theme';

/** Shows how each typed exclusion or intolerance was understood and which foods it removes (D-021). */
export function ExclusionSummary({
  excluded = [],
  intolerances = [],
}: {
  excluded?: string[];
  intolerances?: string[];
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const entries = resolveExclusions(excluded, intolerances);
  if (entries.length === 0) return null;

  return (
    <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
      <Text variant="label">{t('exclusions.title')}</Text>
      {entries.map((e, index) => {
        const foods = excludedFoods(e)
          .map((f) => f.name[lang])
          .join(', ');
        const meaning = e.meanings.map((m) => t(`exclusions.meaning.${m}`)).join(', ');
        const key =
          e.meanings.length > 0 ? (foods ? 'understood' : 'understoodNone') : foods ? 'byName' : 'notUnderstood';
        return (
          <Text
            key={`${e.source}-${index}`}
            variant="caption"
            color={key === 'notUnderstood' ? 'warning' : 'textMuted'}>
            {t(`exclusions.${key}`, { input: e.input, meaning, foods })}
          </Text>
        );
      })}
    </View>
  );
}
