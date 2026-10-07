import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, Text, type IconName } from '@/components/ui';
import type { ProgressJourney } from '@/domain/journey/progress-journey';
import { spacing, useColors, type ColorToken } from '@/theme';

type T = (key: string, params?: Record<string, unknown>) => string;

const STEP: Record<'reached' | 'current' | 'upcoming', { icon: IconName; color: ColorToken }> = {
  reached: { icon: 'done', color: 'success' },
  current: { icon: 'partial', color: 'primary' },
  upcoming: { icon: 'todo', color: 'textMuted' },
};

/** The path as a vertical timeline, then the five latest other milestones, newest first. */
export function Path({ progress, date }: { progress: ProgressJourney; date: (d: string) => string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const milestones = progress.milestones
    .filter((m) => !m.id.startsWith('checkpoint_'))
    .sort((a, b) => b.reachedOn.localeCompare(a.reachedOn))
    .slice(0, 5);
  return (
    <>
      <Card>
        {progress.path.map((c, i) => (
          <View
            key={c.key}
            style={styles.step}
            accessible
            accessibilityLabel={`${t(`progress.path.${c.key}`)}, ${t(`progress.path.status.${c.status}`)}`}>
            <View style={styles.rail}>
              <Icon name={STEP[c.status].icon} size="md" color={STEP[c.status].color} />
              {i < progress.path.length - 1 ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
            </View>
            <View style={styles.text}>
              <Text
                variant={c.status === 'current' ? 'bodyMedium' : 'body'}
                color={c.status === 'upcoming' ? 'textMuted' : 'textPrimary'}>
                {t('progress.path.step', { step: c.step, label: t(`progress.path.${c.key}`) })}
              </Text>
              <Text variant="caption" color="textMuted">
                {c.reachedOn
                  ? t('progress.path.reachedOn', { date: date(c.reachedOn) })
                  : t(`progress.path.status.${c.status}`)}
              </Text>
            </View>
          </View>
        ))}
      </Card>
      {milestones.length > 0 ? (
        <Card tone="subtle" style={styles.milestones}>
          <Text variant="headline">{t('progress.milestones.title')}</Text>
          {milestones.map((m) => (
            <View key={m.id} style={styles.milestone}>
              <Icon name="celebrate" size="sm" color="success" />
              <Text style={styles.flex}>
                {t('progress.milestones.item', { label: milestoneLabel(m.id, t), date: date(m.reachedOn) })}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

function milestoneLabel(id: string, t: T): string {
  const n = id.match(/_(\d+)$/)?.[1];
  if (id.startsWith('sessions_')) return t('progress.milestones.sessions', { count: Number(n) });
  if (id.startsWith('weeks_streak_')) return t('progress.milestones.weeks_streak', { count: Number(n) });
  if (id.startsWith('active_days_')) return t('progress.milestones.active_days', { count: Number(n) });
  if (id.startsWith('checkpoint_')) return t('progress.milestones.checkpoint', { step: Number(n) });
  return t(`progress.milestones.${id}`);
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 24 },
  line: { width: 2, flex: 1, minHeight: spacing.md, marginVertical: spacing.xxs },
  text: { flex: 1, paddingBottom: spacing.md, gap: spacing.xxs },
  milestones: { gap: spacing.sm },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
