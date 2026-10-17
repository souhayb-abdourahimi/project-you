import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text, type IconName } from '@/components/ui';
import type { ProgressJourney } from '@/domain/journey/progress-journey';
import { radius, spacing, useColors, type ColorToken } from '@/theme';

type T = (key: string, params?: Record<string, unknown>) => string;

const STEP: Record<'reached' | 'current' | 'upcoming', { icon: IconName; color: ColorToken }> = {
  reached: { icon: 'done', color: 'success' },
  current: { icon: 'partial', color: 'primary' },
  upcoming: { icon: 'todo', color: 'textMuted' },
};

/** Milestones shown before "see every milestone". */
const MILESTONES_SHOWN = 3;

/**
 * The path, compact (W-10 "moins de texte"): where the user is ("Étape 5 sur 5 · Bilan de
 * mi-parcours") on a bar of steps, the full timeline one tap away; then the latest milestones,
 * newest first, every one of them one tap away.
 */
export function Path({ progress, date }: { progress: ProgressJourney; date: (d: string) => string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const [steps, setSteps] = useState(false);
  const [allMilestones, setAllMilestones] = useState(false);
  const milestones = progress.milestones
    .filter((m) => !m.id.startsWith('checkpoint_'))
    .sort((a, b) => b.reachedOn.localeCompare(a.reachedOn));
  const shown = allMilestones ? milestones : milestones.slice(0, MILESTONES_SHOWN);
  const path = progress.path;
  const reached = path.filter((c) => c.status === 'reached').length;
  const focus = path.find((c) => c.status === 'current') ?? path.find((c) => c.status === 'upcoming') ?? null;
  return (
    <>
      {path.length > 0 ? (
        <Card style={styles.card}>
          <View
            style={styles.summary}
            accessible
            accessibilityLabel={[
              focus
                ? `${t('progress.path.progressOf', { step: focus.step, total: path.length })}, ${t(`progress.path.${focus.key}`)}, ${t(`progress.path.status.${focus.status}`)}`
                : t('progress.path.allReached'),
              t('progress.path.barA11y', { reached, total: path.length }),
            ].join('. ')}>
            <Text variant="captionStrong" color="textSecondary">
              {focus
                ? t('progress.path.progressOf', { step: focus.step, total: path.length })
                : t('progress.path.allReached')}
            </Text>
            {focus ? <Text variant="headline">{t(`progress.path.${focus.key}`)}</Text> : null}
            <View style={styles.bar}>
              {path.map((c) => (
                <View
                  key={c.key}
                  style={[
                    styles.segment,
                    {
                      backgroundColor:
                        c.status === 'reached'
                          ? colors.success
                          : c.status === 'current'
                            ? colors.primary
                            : colors.surfaceSubtle,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
          <View style={styles.toggle}>
            <Button
              compact
              variant="ghost"
              label={t(steps ? 'progress.path.hideAll' : 'progress.path.showAll')}
              expanded={steps}
              onPress={() => setSteps((v) => !v)}
            />
          </View>
          {steps ? (
            <View style={styles.timeline}>
              {path.map((c, i) => (
                <View
                  key={c.key}
                  style={styles.step}
                  accessible
                  accessibilityLabel={`${t(`progress.path.${c.key}`)}, ${t(`progress.path.status.${c.status}`)}`}>
                  <View style={styles.rail}>
                    <Icon name={STEP[c.status].icon} size="md" color={STEP[c.status].color} />
                    {i < path.length - 1 ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
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
            </View>
          ) : null}
        </Card>
      ) : null}
      {milestones.length > 0 ? (
        <Card tone="subtle" style={styles.milestones}>
          <Text variant="headline">{t('progress.milestones.title')}</Text>
          {shown.map((m) => (
            <View key={m.id} style={styles.milestone}>
              <Icon name="celebrate" size="sm" color="success" />
              <Text style={styles.flex}>
                {t('progress.milestones.item', { label: milestoneLabel(m.id, t), date: date(m.reachedOn) })}
              </Text>
            </View>
          ))}
          {milestones.length > MILESTONES_SHOWN ? (
            <View style={styles.toggle}>
              <Button
                compact
                variant="ghost"
                label={
                  allMilestones
                    ? t('progress.milestones.showLess')
                    : t('progress.milestones.showAll', { count: milestones.length })
                }
                expanded={allMilestones}
                onPress={() => setAllMilestones((v) => !v)}
              />
            </View>
          ) : null}
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
  card: { gap: spacing.sm },
  summary: { gap: spacing.xs },
  bar: { flexDirection: 'row', gap: spacing.xxs, marginTop: spacing.xs },
  segment: { flex: 1, height: 6, borderRadius: radius.pill },
  toggle: { flexDirection: 'row' },
  timeline: { paddingTop: spacing.xs },
  step: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 24 },
  line: { width: 2, flex: 1, minHeight: spacing.md, marginVertical: spacing.xxs },
  text: { flex: 1, paddingBottom: spacing.md, gap: spacing.xxs },
  milestones: { gap: spacing.sm },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
