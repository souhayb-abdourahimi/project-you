import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Notice, Screen, ScreenHeader, Skeleton, Text } from '@/components/ui';
import { toIsoDate } from '@/domain/shared/dates';
import { radius, spacing, useColors } from '@/theme';

import { MealDraftEditor } from './MealDraftEditor';
import { useMealAnalysis, type AnalysisIssue } from './useMealAnalysis';

const ISSUE_KEY: Record<AnalysisIssue, string> = {
  denied: 'nutrition.analysis.issue.denied',
  too_large: 'nutrition.analysis.issue.tooLarge',
  pick_failed: 'nutrition.analysis.issue.pickFailed',
  timeout: 'nutrition.analysis.issue.timeout',
  network: 'nutrition.analysis.issue.network',
  rate_limited: 'nutrition.analysis.issue.rateLimited',
  auth: 'nutrition.analysis.issue.auth',
  unknown: 'nutrition.analysis.issue.unknown',
};

/** Route params are user input: only a well-formed date is used, today otherwise. */
const readDate = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toIsoDate(new Date());

/**
 * "Analyser le repas" (W-10): a photo, chosen by the user, analysed only after "Analyser"; the
 * estimate is checked and corrected, then added only on confirmation. Without an analysis service
 * the same screen composes the meal by hand from the Ciqual catalogue.
 */
export function MealAnalysisScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const params = useLocalSearchParams<{ date?: string }>();
  const analysis = useMealAnalysis(readDate(params.date));
  const { phase, issue, uri } = analysis;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/nutrition'));

  return (
    <Screen airy>
      <ScreenHeader title={t('nutrition.analysis.title')} subtitle={t('nutrition.analysis.subtitle')} />

      {uri && phase !== 'start' ? (
        <View style={[styles.photo, { backgroundColor: colors.inverse }]}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel={t('nutrition.analysis.photoA11y')}
          />
        </View>
      ) : null}

      {issue && (phase === 'start' || phase === 'preview') ? (
        <Notice tone="info" message={t(ISSUE_KEY[issue])} />
      ) : null}

      {phase === 'start' && !analysis.photoAvailable ? (
        <Card style={styles.card}>
          <Notice
            tone="neutral"
            title={t('nutrition.analysis.unavailableTitle')}
            message={t('nutrition.analysis.unavailableBody')}
          />
          <Button block label={t('nutrition.analysis.compose')} onPress={analysis.composeManually} />
        </Card>
      ) : null}

      {phase === 'start' && analysis.photoAvailable ? (
        <Card raised style={styles.card}>
          <View style={[styles.mark, { backgroundColor: colors.primarySubtle }]}>
            <Icon name="camera" size="lg" color="primary" />
          </View>
          <Text variant="title3">{t('nutrition.analysis.startTitle')}</Text>
          <Text color="textSecondary">{t('nutrition.analysis.startBody')}</Text>
          <Button
            block
            icon="camera"
            label={t('nutrition.analysis.takePhoto')}
            onPress={() => analysis.choose('camera')}
          />
          <Button
            block
            variant="secondary"
            label={t('nutrition.analysis.pickPhoto')}
            onPress={() => analysis.choose('library')}
          />
          <Button variant="ghost" label={t('nutrition.analysis.compose')} onPress={analysis.composeManually} />
        </Card>
      ) : null}

      {phase === 'preview' ? (
        <Card style={styles.card}>
          <Text variant="caption" color="textSecondary">
            {t('nutrition.analysis.consent')}
          </Text>
          <Button block label={t('nutrition.analysis.analyze')} onPress={analysis.analyze} />
          <Button variant="ghost" label={t('nutrition.analysis.changePhoto')} onPress={analysis.restart} />
        </Card>
      ) : null}

      {phase === 'analyzing' ? (
        <Card style={styles.card} accessibilityLabel={t('nutrition.analysis.analyzing')}>
          <Text variant="headline" accessibilityLiveRegion="polite">
            {t('nutrition.analysis.analyzing')}
          </Text>
          <Text variant="caption" color="textMuted">
            {t('nutrition.analysis.analyzingHint')}
          </Text>
          <Skeleton height={18} width="80%" />
          <Skeleton height={18} width="60%" />
          <Skeleton height={56} />
          <Button variant="secondary" label={t('common.cancel')} onPress={analysis.cancel} />
        </Card>
      ) : null}

      {phase === 'unavailable' ? (
        <Card style={styles.card}>
          <Notice
            tone="neutral"
            title={t('nutrition.analysis.unavailableTitle')}
            message={t('nutrition.analysis.unavailableBody')}
          />
          <Button block label={t('nutrition.analysis.compose')} onPress={analysis.composeManually} />
        </Card>
      ) : null}

      {phase === 'error' ? (
        <Card style={styles.card}>
          <Notice tone="info" title={t('nutrition.analysis.errorTitle')} message={t(ISSUE_KEY[issue ?? 'unknown'])} />
          <Button block label={t('common.retry')} onPress={analysis.analyze} />
          <Button variant="ghost" label={t('nutrition.analysis.compose')} onPress={analysis.composeManually} />
        </Card>
      ) : null}

      {phase === 'review' ? <MealDraftEditor analysis={analysis} onSaved={back} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { height: 220, borderRadius: radius.card, overflow: 'hidden' },
  card: { gap: spacing.md },
  mark: { width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
