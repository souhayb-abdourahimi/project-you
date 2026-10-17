import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Icon, Section, Text } from '@/components/ui';
import type { ProgressJourney } from '@/domain/journey/progress-journey';
import { getExercise } from '@/domain/training/exercises';
import { formatDate } from '@/lib/format';
import { ExerciseMedia } from '@/features/training/ExerciseMedia';
import { spacing, useColors } from '@/theme';

const exerciseName = (id: string, lang: string) => getExercise(id)?.name[lang === 'en' ? 'en' : 'fr'] ?? id;
const RECORD_KEY = { load: 'recordLoad', reps: 'recordReps', time: 'recordTime' } as const;

/**
 * Loads and reps actually logged: the rising exercises (first → latest logged set), then the latest
 * records. Each row reads as one sentence for screen readers. Nothing estimated.
 */
export function Performance({ progress }: { progress: ProgressJourney }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const { records, exercises } = progress.performance;
  const up = exercises.filter((e) => e.trend === 'up').slice(0, 5);
  // The latest record of each exercise (records come newest first), three at most.
  const latestRecords = records
    .filter((r, i) => records.findIndex((x) => x.exerciseId === r.exerciseId) === i)
    .slice(0, 3);
  const set = (s: { loadKg: number; reps: number; seconds?: number }) =>
    s.seconds !== undefined
      ? t('progress.perf.seconds', { seconds: s.seconds })
      : s.loadKg > 0
        ? t('progress.perf.set', s)
        : t('progress.perf.reps', { reps: s.reps });
  const divider = { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth };
  return (
    <Section title={t('progress.perf.title')}>
      <Card style={styles.card}>
        {records.length === 0 && up.length === 0 ? <Text color="textMuted">{t('progress.perf.none')}</Text> : null}
        {up.map((e, i) => {
          const name = exerciseName(e.exerciseId, i18n.language);
          return (
            <View
              key={e.exerciseId}
              style={[styles.line, i > 0 && divider]}
              accessible
              accessibilityLabel={t('progress.perf.trend', { name, from: set(e.from), to: set(e.to) })}>
              <ExerciseMedia exerciseId={e.exerciseId} label={name} size={44} />
              <View style={styles.flex}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {name}
                </Text>
                <View style={styles.change}>
                  <Text variant="caption" color="textMuted">
                    {set(e.from)}
                  </Text>
                  <Icon name="arrow" size={12} color="textMuted" />
                  <Text variant="captionStrong" color="success">
                    {set(e.to)}
                  </Text>
                </View>
              </View>
              <Icon name="progress" size="sm" color="success" />
            </View>
          );
        })}
        {latestRecords.map((r, i) => {
          const name = exerciseName(r.exerciseId, i18n.language);
          const date = formatDate(r.date, i18n.language);
          return (
            <View
              key={`${r.exerciseId}${r.date}`}
              style={[styles.line, (up.length > 0 || i > 0) && divider]}
              accessible
              accessibilityLabel={t(`progress.perf.${RECORD_KEY[r.kind]}`, { name, set: set(r), date })}>
              <ExerciseMedia exerciseId={r.exerciseId} label={name} size={44} />
              <View style={styles.flex}>
                <View style={styles.badge}>
                  <Badge tone="positive" icon="record" label={t(`progress.perf.recordKind.${r.kind}`)} />
                </View>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {name} · {set(r)}
                </Text>
                <Text variant="caption" color="textMuted">
                  {date}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { gap: 0, paddingVertical: spacing.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  change: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', marginBottom: 2 },
  flex: { flex: 1, gap: 1 },
});
