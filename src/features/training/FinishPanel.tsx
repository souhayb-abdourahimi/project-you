import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, ChoiceGroup, Text } from '@/components/ui';
import type { SessionReason } from '@/domain/journey/outcomes';
import { spacing } from '@/theme';

const STOP_REASONS: SessionReason[] = ['no_time', 'tired', 'pain', 'other'];

/**
 * End of the session. Everything settled: one tap. Otherwise a short confirmation that says what is
 * left without judging it; a reason is optional and makes it a session stopped early (D-034).
 */
export function FinishPanel({
  remaining,
  onFinish,
}: {
  remaining: number;
  onFinish: (stopped?: SessionReason) => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState<SessionReason | null>(null);
  if (remaining === 0) return <Button label={t('workout.finish')} onPress={() => onFinish()} />;
  if (!confirming)
    return <Button variant="secondary" label={t('workout.finish')} onPress={() => setConfirming(true)} />;
  return (
    <Card>
      <Text variant="title3">{t('workout.finishTitle')}</Text>
      <Text color="textMuted">{t('workout.finishRemaining', { count: remaining })}</Text>
      <Text variant="caption" color="textMuted">
        {t('workout.stopReasonTitle')}
      </Text>
      <ChoiceGroup
        single
        label={t('workout.stopReasonTitle')}
        options={STOP_REASONS.map((r) => ({ value: r, label: t(`workout.stopReasons.${r}`) }))}
        selected={reason ? [reason] : []}
        onToggle={(r) => setReason(reason === r ? null : r)}
      />
      <View style={styles.row}>
        <Button label={t('workout.finishNow')} onPress={() => onFinish(reason ?? undefined)} />
        <Button variant="ghost" label={t('workout.keepGoing')} onPress={() => setConfirming(false)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
