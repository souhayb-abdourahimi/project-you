import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Icon, Section, Text } from '@/components/ui';
import type { ProgressJourney } from '@/domain/journey/progress-journey';
import { spacing } from '@/theme';

/** Since the start: counted facts, said positively; done and adapted sessions both count. */
export function SinceStart({ progress }: { progress: ProgressJourney }) {
  const { t } = useTranslation();
  const s = progress.sinceStart;
  const sessions = s.adherence?.sessions;
  return (
    <Section title={t('progress.since.title')}>
      <Card raised style={styles.card}>
        <Text variant="title3">
          {s.days === 0 ? t('progress.since.today') : t('progress.since.days', { count: s.days })}
        </Text>
        <Text variant="bodyMedium">
          {t('progress.since.summary', { activeDays: s.activeDays, sessions: s.sessions })}
        </Text>
        {s.regularity.streakWeeks >= 1 ? (
          <View style={styles.badge}>
            <Badge
              tone="positive"
              icon="sessions"
              label={t('progress.since.streak', { count: s.regularity.streakWeeks })}
            />
          </View>
        ) : null}
        {sessions && sessions.planned > 0 ? (
          <Text color="textSecondary">
            {t(
              sessions.done + sessions.adapted >= sessions.planned
                ? 'progress.since.adherenceAll'
                : sessions.adapted > 0
                  ? 'progress.since.adherenceAdapted'
                  : 'progress.since.adherence',
              { done: sessions.done + sessions.adapted, planned: sessions.planned, adapted: sessions.adapted },
            )}
          </Text>
        ) : null}
        {sessions && sessions.unknownDays > 0 ? (
          <Text variant="caption" color="textMuted">
            {t('progress.since.prescriptionUnknown', { count: sessions.unknownDays })}
          </Text>
        ) : null}
      </Card>
    </Section>
  );
}

/** Habits kept: one line each, only those that happened (nothing is listed as missing). */
export function Habits({ progress }: { progress: ProgressJourney }) {
  const { t } = useTranslation();
  const h = progress.habits;
  const lines: [string, number][] = [
    ['progress.habits.trainingWeeks', h.trainingWeeks],
    ['progress.habits.mealsLoggedDays', h.mealsLoggedDays],
    ['progress.habits.activityDays', h.activityDays],
    ['progress.habits.weighInWeeks', h.weighInWeeks],
    ['progress.habits.checkins', h.checkins],
  ];
  const shown = lines.filter(([, n]) => n > 0);
  return (
    <Section title={t('progress.habits.title')}>
      <Card style={styles.card}>
        {shown.length === 0 ? <Text color="textMuted">{t('progress.habits.none')}</Text> : null}
        {shown.map(([key, count]) => (
          <View key={key} style={styles.line}>
            <Icon name="done" size="sm" color="success" />
            <Text style={styles.flex}>{t(key, { count })}</Text>
          </View>
        ))}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  badge: { flexDirection: 'row' },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
