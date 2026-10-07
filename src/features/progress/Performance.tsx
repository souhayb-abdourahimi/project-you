import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, Section, Text } from '@/components/ui';
import type { ProgressJourney } from '@/domain/journey/progress-journey';
import { getExercise } from '@/domain/training/exercises';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme';

const exerciseName = (id: string, lang: string) => getExercise(id)?.name[lang === 'en' ? 'en' : 'fr'] ?? id;

/** Loads and reps actually logged: the rising exercises, then the latest records. Nothing estimated. */
export function Performance({ progress }: { progress: ProgressJourney }) {
  const { t, i18n } = useTranslation();
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
  return (
    <Section title={t('progress.perf.title')}>
      <Card style={styles.card}>
        {records.length === 0 && up.length === 0 ? <Text color="textMuted">{t('progress.perf.none')}</Text> : null}
        {up.map((e) => (
          <View key={e.exerciseId} style={styles.line}>
            <View style={styles.well}>
              <Icon name="progress" size="sm" color="progress" />
            </View>
            <Text variant="bodyMedium" style={styles.flex}>
              {t('progress.perf.trend', {
                name: exerciseName(e.exerciseId, i18n.language),
                from: set(e.from),
                to: set(e.to),
              })}
            </Text>
          </View>
        ))}
        {latestRecords.map((r) => (
          <View key={`${r.exerciseId}${r.date}`} style={styles.line}>
            <View style={styles.well}>
              <Icon name="celebrate" size="sm" color="success" />
            </View>
            <Text color="textSecondary" style={styles.flex}>
              {t(`progress.perf.${{ load: 'recordLoad', reps: 'recordReps', time: 'recordTime' }[r.kind]}`, {
                name: exerciseName(r.exerciseId, i18n.language),
                set: set(r),
                date: formatDate(r.date, i18n.language),
              })}
            </Text>
          </View>
        ))}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  well: { paddingTop: spacing.xxs },
  flex: { flex: 1 },
});
