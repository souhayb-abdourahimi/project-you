import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button, Card, Notice, Text } from '@/components/ui';
import { spacing } from '@/theme';

import type { MealAnalysis } from './useMealAnalysis';

/**
 * Why the photo analysis cannot run, precisely (D-048): local mode, server function missing, not
 * starting, or without a configured provider (with the names of the missing settings, never a
 * value). Composing by hand stays one tap away: the Ciqual calculation is the same.
 */
export function AnalysisUnavailable({ analysis }: { analysis: MealAnalysis }) {
  const { t } = useTranslation();
  const { reason, missing } = analysis.unavailable ?? { reason: 'not_configured' as const, missing: [] };
  return (
    <Card style={styles.card}>
      <Notice
        tone="neutral"
        title={t(`nutrition.analysis.unavailable.${reason}.title`)}
        message={t(`nutrition.analysis.unavailable.${reason}.body`)}
      />
      {reason !== 'local_mode' ? (
        <Text variant="caption" color="textMuted" selectable>
          {missing.length > 0
            ? t('nutrition.analysis.unavailable.missing', { names: missing.join(', ') })
            : t('nutrition.analysis.unavailable.code', { code: reason })}
        </Text>
      ) : null}
      <Button block label={t('nutrition.analysis.compose')} onPress={analysis.composeManually} />
    </Card>
  );
}

const styles = StyleSheet.create({ card: { gap: spacing.md } });
