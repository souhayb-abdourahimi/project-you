import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, ChoiceGroup, StatTile, Text } from '@/components/ui';
import { getExercise } from '@/domain/training/exercises';
import { DIFFICULTY_LEVELS, difficultyLevel } from '@/domain/training/program';
import type { SessionResult, SessionSummary as Summary } from '@/domain/training/session';
import { formatNumber } from '@/lib/format';
import { spacing } from '@/theme';

import type { SessionController } from './useSessionController';
import type { usePreferenceQuestion } from './usePreferenceQuestion';

/** End of session: real facts only, one question ("Comment était la séance ?"), no questionnaire. */
export function SessionSummary({
  summary,
  result,
  difficulty,
  onRate,
  preference,
}: {
  summary: Summary;
  result: SessionResult;
  difficulty: number | null;
  onRate: SessionController['actions']['rateSession'];
  preference: ReturnType<typeof usePreferenceQuestion>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const name = (id: string) => getExercise(id)?.name[lang] ?? id;
  const outcome = result === 'stopped' || result === 'partial' ? result : 'completed';
  return (
    <View style={styles.root}>
      <Text variant="title" accessibilityLiveRegion="polite">
        {t('workout.summary.title')}
      </Text>
      <Text color="textMuted">{t(`workout.summary.result.${outcome}`)}</Text>
      <View style={styles.tiles}>
        <StatTile
          label={t('workout.summary.duration')}
          value={
            summary.minutes !== null
              ? t('workout.summary.minutes', { count: summary.minutes })
              : t('workout.summary.unknown')
          }
        />
        <StatTile
          label={t('workout.summary.exercises')}
          value={t('workout.summary.ratio', { done: summary.exercisesDone, total: summary.exercisesTotal })}
        />
        <StatTile label={t('workout.summary.sets')} value={String(summary.sets)} />
      </View>
      {summary.replacements.length > 0 ? (
        <Card muted>
          <Text variant="label">{t('workout.summary.replacements')}</Text>
          {summary.replacements.map((r) => (
            <Text key={r.fromId}>{t('workout.summary.replacement', { from: name(r.fromId), to: name(r.toId) })}</Text>
          ))}
        </Card>
      ) : null}
      {summary.notPerformed.length > 0 ? (
        <Text color="textMuted">
          {t('workout.summary.notPerformed', { names: summary.notPerformed.map(name).join(', ') })}
        </Text>
      ) : null}
      {summary.records.length > 0 ? (
        <Card>
          <Text variant="label" color="success">
            {t('workout.summary.records')}
          </Text>
          {summary.records.map((r) => (
            <Text key={r.exerciseId}>
              {t(`workout.summary.record_${r.kind}`, {
                name: name(r.exerciseId),
                load: formatNumber(r.loadKg, lang),
                reps: r.reps,
              })}
            </Text>
          ))}
        </Card>
      ) : null}
      <Card>
        <Text variant="heading">{t('workout.sessionDifficulty')}</Text>
        <ChoiceGroup
          single
          label={t('workout.sessionDifficulty')}
          options={DIFFICULTY_LEVELS.map((l) => ({ value: l, label: t(`workout.difficulty.${l}`) }))}
          selected={difficulty ? [difficultyLevel(difficulty)!] : []}
          onToggle={onRate}
        />
        {difficulty ? (
          <Text variant="caption" color="success" accessibilityLiveRegion="polite">
            {t('workout.summary.thanks')}
          </Text>
        ) : null}
      </Card>
      {preference ? (
        <Card muted>
          {preference.answer === 'removed' ? (
            <Text accessibilityLiveRegion="polite">
              {preference.replacement
                ? t('workout.summary.preferenceDoneWith', { name: name(preference.replacement) })
                : t('workout.summary.preferenceDone')}
            </Text>
          ) : preference.answer === 'kept' ? (
            <Text accessibilityLiveRegion="polite">{t('workout.summary.thanks')}</Text>
          ) : (
            <>
              <Text>{t('workout.summary.preference', { name: name(preference.exerciseId) })}</Text>
              <View style={styles.row}>
                <Button
                  compact
                  variant="secondary"
                  label={t('workout.summary.preferenceYes')}
                  onPress={preference.remove}
                />
                <Button compact variant="ghost" label={t('workout.summary.preferenceNo')} onPress={preference.keep} />
              </View>
            </>
          )}
        </Card>
      ) : null}
      <Button
        label={t('workout.summary.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
