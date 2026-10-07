import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import type { ProfileImpact } from '@/domain/settings/impact';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme';

/**
 * "Ce qui va changer" (D-043): what saving does, before it is done. Facts of the engines only
 * (new version from today, meals from today, targets recalculated, an adaptation replaced), never
 * a promise about results.
 */
export function ChangePreview({ impact }: { impact: ProfileImpact }) {
  const { t, i18n } = useTranslation();
  if (impact.changes.length === 0) return null;
  const fields = impact.changes.map((c) => t(`settings.fields.${c.field}`)).join(', ');
  return (
    <Card muted>
      <View accessibilityLiveRegion="polite" style={{ gap: spacing.sm }}>
        <Text variant="title3">{t('settings.impact.title')}</Text>
        <Text variant="caption" color="textMuted">
          {t('settings.impact.changed', { fields })}
        </Text>
        {impact.effects.map((e) => (
          <Text key={e}>- {t(`settings.impact.effects.${e}`)}</Text>
        ))}
        {impact.replaced.map(({ decision, reason }) => (
          <Text key={decision.id}>
            -{' '}
            {t(`settings.impact.replaced.${reason}`, {
              date: formatDate(decision.effectiveFrom, i18n.language),
              from: decision.from,
              to: decision.to,
            })}
          </Text>
        ))}
        {impact.removedAllergies.length > 0 ? (
          <Text color="danger" accessibilityRole="alert">
            {t('settings.impact.allergiesRemoved', {
              list: impact.removedAllergies.map((a) => t(`enums.allergen.${a}`)).join(', '),
            })}
          </Text>
        ) : null}
        <Text variant="caption" color="textMuted">
          {t('settings.impact.history')}
        </Text>
      </View>
    </Card>
  );
}
