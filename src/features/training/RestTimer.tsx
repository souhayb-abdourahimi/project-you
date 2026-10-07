import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, ProgressRing, Text } from '@/components/ui';
import { restRemaining } from '@/domain/training/session';
import { spacing } from '@/theme';
import { useWorkoutUi } from '@/state/workout';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Rest after a set: never forced (skip, +30 s, pause), and it keeps counting across screens. */
export function RestTimer({ session }: { session: string }) {
  const { t } = useTranslation();
  const rest = useWorkoutUi((s) => (s.rest?.session === session ? s.rest : null));
  const [now, setNow] = useState(() => Date.now());
  const running = !!rest && rest.endsAt !== null;
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [running, rest?.endsAt]);
  if (!rest) return null;
  // Before the first tick `now` may be older than the start: never show more than the rest itself.
  const left = Math.min(restRemaining(rest, now), Math.ceil(rest.totalMs / 1000));
  const ui = useWorkoutUi.getState();
  return (
    <Card tone="accent">
      {/* The ring empties as the rest runs: a real timer, its seconds said in words. */}
      <View style={styles.row}>
        <ProgressRing
          value={rest.totalMs > 0 ? (left * 1000) / rest.totalMs : 0}
          size={88}
          stroke={8}
          track="surface"
          label={t('workout.rest.label', { seconds: left })}>
          <Text variant="metric" style={styles.clock}>
            {clock(left)}
          </Text>
        </ProgressRing>
        <View style={styles.text}>
          <View style={styles.title}>
            <Icon name="timer" size="sm" color="primary" />
            <Text variant="headline">{t('workout.rest.title')}</Text>
          </View>
          {left === 0 ? (
            <Text color="success" accessibilityLiveRegion="polite">
              {t('workout.rest.over')}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Button compact variant="secondary" label={t('workout.rest.skip')} onPress={ui.skipRest} />
        <Button
          compact
          variant="secondary"
          label={t('workout.rest.extend')}
          accessibilityHint={t('workout.rest.extendLabel')}
          onPress={ui.extendRest}
        />
        {left > 0 ? (
          <Button
            compact
            variant="ghost"
            label={running ? t('workout.rest.pause') : t('workout.rest.resume')}
            onPress={running ? ui.pauseRest : ui.resumeRest}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  text: { flex: 1, gap: spacing.xs },
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  clock: { fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
