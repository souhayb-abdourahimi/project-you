import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Section, Text } from '@/components/ui';
import type { ProgressJourney } from '@/domain/journey/progress-journey';
import { formatNumber } from '@/lib/format';
import { spacing } from '@/theme';

import { Figure, Figures } from './Figure';

/**
 * Since the start: counted facts as figures (days, active days, sessions), the streak, and the
 * adherence sentence one tap away (its ring is the overview tile). Done and adapted sessions both
 * count; days whose prescription is unknown are said, never counted as missed.
 */
export function SinceStart({ progress }: { progress: ProgressJourney }) {
  const { t, i18n } = useTranslation();
  const [details, setDetails] = useState(false);
  const s = progress.sinceStart;
  const sessions = s.adherence?.sessions;
  const num = (v: number) => formatNumber(v, i18n.language);
  const hasAdherence = !!sessions && sessions.planned > 0;
  const done = sessions ? sessions.done + sessions.adapted : 0;
  return (
    <Section title={t('progress.since.title')}>
      <Card raised style={styles.card}>
        <Figures>
          {s.days === 0 ? (
            <Figure value={t('progress.since.figureToday')} label={t('progress.since.figureStart')} />
          ) : (
            <Figure value={num(s.days)} label={t('progress.since.figureDays')} />
          )}
          <Figure value={num(s.activeDays)} label={t('progress.since.figureActive')} />
          <Figure value={num(s.sessions)} label={t('progress.since.figureSessions')} />
        </Figures>
        {s.regularity.streakWeeks >= 1 ? (
          <View style={styles.badge}>
            <Badge
              tone="positive"
              icon="sessions"
              label={t('progress.since.streak', { count: s.regularity.streakWeeks })}
            />
          </View>
        ) : null}
        {hasAdherence || (sessions && sessions.unknownDays > 0) ? (
          <View style={styles.details}>
            <Button
              compact
              variant="ghost"
              label={t(details ? 'progress.since.detailsHide' : 'progress.since.details')}
              expanded={details}
              onPress={() => setDetails((d) => !d)}
            />
            {details && sessions ? (
              <View style={styles.detailsBody} accessibilityLiveRegion="polite">
                {hasAdherence ? (
                  <Text color="textSecondary">
                    {t(
                      done >= sessions.planned
                        ? 'progress.since.adherenceAll'
                        : sessions.adapted > 0
                          ? 'progress.since.adherenceAdapted'
                          : 'progress.since.adherence',
                      { done, planned: sessions.planned, adapted: sessions.adapted },
                    )}
                  </Text>
                ) : null}
                {sessions.unknownDays > 0 ? (
                  <Text variant="caption" color="textMuted">
                    {t('progress.since.prescriptionUnknown', { count: sessions.unknownDays })}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>
    </Section>
  );
}

/** Habits kept, as figures: only those that happened (nothing is listed as missing or as zero). */
export function Habits({ progress }: { progress: ProgressJourney }) {
  const { t, i18n } = useTranslation();
  const h = progress.habits;
  const lines: [keyof typeof h & string, number][] = [
    ['trainingWeeks', h.trainingWeeks],
    ['mealsLoggedDays', h.mealsLoggedDays],
    ['activityDays', h.activityDays],
    ['weighInWeeks', h.weighInWeeks],
    ['checkins', h.checkins],
  ];
  const shown = lines.filter(([, n]) => n > 0);
  return (
    <Section title={t('progress.habits.title')}>
      <Card style={styles.card}>
        {shown.length === 0 ? (
          <Text color="textMuted">{t('progress.habits.none')}</Text>
        ) : (
          <Figures>
            {shown.map(([key, count]) => (
              <Figure key={key} value={formatNumber(count, i18n.language)} label={t(`progress.habits.figure.${key}`)} />
            ))}
          </Figures>
        )}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  badge: { flexDirection: 'row' },
  details: { gap: spacing.xs },
  detailsBody: { gap: spacing.xs },
});
