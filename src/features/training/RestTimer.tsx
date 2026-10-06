import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
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
    <Card muted>
      <View style={styles.row}>
        <Text variant="label" color="textMuted">
          {t('workout.rest.title')}
        </Text>
        <Text
          variant="display"
          accessibilityRole="timer"
          accessibilityLabel={t('workout.rest.label', { seconds: left })}
          style={styles.clock}>
          {clock(left)}
        </Text>
      </View>
      {left === 0 ? (
        <Text color="success" accessibilityLiveRegion="polite">
          {t('workout.rest.over')}
        </Text>
      ) : null}
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clock: { fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
