import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Notice, Screen, ScreenHeader, Skeleton, Text } from '@/components/ui';
import { toIsoDate } from '@/domain/shared/dates';
import { useUnsavedGuard } from '@/features/settings/useUnsavedGuard';
import { radius, spacing, useColors } from '@/theme';

import { MealDraftEditor } from './MealDraftEditor';
import { RETRYABLE_ISSUES, useMealAnalysis, type AnalysisIssue } from './useMealAnalysis';

const ISSUE_KEY: Record<AnalysisIssue, string> = {
  denied: 'nutrition.analysis.issue.denied',
  too_large: 'nutrition.analysis.issue.tooLarge',
  pick_failed: 'nutrition.analysis.issue.pickFailed',
  timeout: 'nutrition.analysis.issue.timeout',
  network: 'nutrition.analysis.issue.network',
  service: 'nutrition.analysis.issue.service',
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
  // Leaving with a meal being built asks first; once added, the screen closes (after the guard is off).
  const [saved, setSaved] = useState(false);
  useUnsavedGuard(!saved && phase === 'review' && analysis.draft.items.length > 0, {
    title: t('nutrition.analysis.leaveTitle'),
    message: t('nutrition.analysis.leaveMessage'),
    leave: t('settings.form.leave'),
    stay: t('settings.form.stay'),
  });
  useEffect(() => {
    if (saved) back();
  }, [saved]);

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
        <Notice tone="info" role="alert" message={t(ISSUE_KEY[issue])} />
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
          {analysis.cameraAvailable ? (
            <Button
              block
              icon="camera"
              label={t('nutrition.analysis.takePhoto')}
              onPress={() => analysis.choose('camera')}
            />
          ) : null}
          <Button
            block
            variant={analysis.cameraAvailable ? 'secondary' : 'primary'}
            label={t(analysis.cameraAvailable ? 'nutrition.analysis.pickPhoto' : 'nutrition.analysis.pickFile')}
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
        <Card style={styles.card}>
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
          <Notice
            tone="info"
            role="alert"
            title={t('nutrition.analysis.errorTitle')}
            message={t(ISSUE_KEY[issue ?? 'unknown'])}
          />
          {RETRYABLE_ISSUES.includes(issue ?? 'unknown') ? (
            <Button block label={t('common.retry')} onPress={analysis.analyze} />
          ) : null}
          <Button
            block={!RETRYABLE_ISSUES.includes(issue ?? 'unknown')}
            variant={RETRYABLE_ISSUES.includes(issue ?? 'unknown') ? 'ghost' : 'primary'}
            label={t('nutrition.analysis.compose')}
            onPress={analysis.composeManually}
          />
        </Card>
      ) : null}

      {phase === 'review' ? <MealDraftEditor analysis={analysis} onSaved={() => setSaved(true)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { height: 220, borderRadius: radius.card, overflow: 'hidden' },
  card: { gap: spacing.md },
  mark: { width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
