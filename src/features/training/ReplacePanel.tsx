import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, ChoiceGroup, Text } from '@/components/ui';
import type { TrainingProfile } from '@/domain/profile/schemas';
import { getExercise } from '@/domain/training/exercises';
import { findReplacements, type ReplacementReason } from '@/domain/training/replacement';
import { replacementAdvice, SHOWN_REPLACEMENT_REASONS, type SessionExercise } from '@/domain/training/session';
import { spacing } from '@/theme';

/**
 * Replace flow (D-034): the reason first (it shapes the alternatives and what is said), then the
 * compatible alternatives; the user picks one, nothing is replaced automatically. A movement that
 * bothers also offers to skip the exercise or to end the session, never to carry on.
 */
export function ReplacePanel({
  exercise,
  training,
  onReplace,
  onSkip,
  onEndSession,
  onClose,
}: {
  exercise: SessionExercise;
  training: Pick<TrainingProfile, 'equipment' | 'level' | 'refusedExerciseIds'>;
  onReplace: (toId: string, reason: ReplacementReason) => void;
  onSkip: (reason: ReplacementReason) => void;
  onEndSession: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const [reason, setReason] = useState<ReplacementReason | null>(null);
  const advice = reason ? replacementAdvice(reason) : null;
  const options = reason
    ? findReplacements(exercise.exerciseId, reason, training)
        .filter((e) => e.id !== exercise.prescribedId)
        .slice(0, 4)
    : [];
  const info = getExercise(exercise.exerciseId);
  return (
    <Card>
      <Text variant="title3">{t('workout.replaceTitle')}</Text>
      <ChoiceGroup
        single
        label={t('workout.replaceTitle')}
        options={SHOWN_REPLACEMENT_REASONS.map((r) => ({ value: r, label: t(`workout.replaceReasons.${r}`) }))}
        selected={reason ? [reason] : []}
        onToggle={setReason}
      />
      {advice?.note ? (
        <Text color={advice.note === 'discomfort' ? 'warning' : 'textMuted'} accessibilityLiveRegion="polite">
          {t(`workout.advice.${advice.note}`)}
        </Text>
      ) : null}
      {advice?.showCues && info ? (
        <Text variant="caption">
          {t('workout.cues')} : {info.cues[lang]}
        </Text>
      ) : null}
      {reason ? (
        <View style={styles.list} testID="alternatives">
          <Text variant="label">{options.length > 0 ? t('workout.alternatives') : t('workout.noReplacement')}</Text>
          {options.map((o) => (
            <Button
              key={o.id}
              variant="secondary"
              label={o.name[lang]}
              accessibilityHint={t('workout.choose', { name: o.name[lang] })}
              onPress={() => onReplace(o.id, reason)}
            />
          ))}
        </View>
      ) : null}
      {advice?.offerStop && reason ? (
        <View style={styles.row}>
          <Button compact variant="secondary" label={t('workout.notPerformedConfirm')} onPress={() => onSkip(reason)} />
          <Button compact variant="secondary" label={t('workout.endHere')} onPress={onEndSession} />
        </View>
      ) : null}
      <Button compact variant="ghost" label={t('workout.cancel')} onPress={onClose} />
    </Card>
  );
}

/** "Je ne fais pas cet exercice": an explicit status, with an optional reason. */
export function NotPerformedPanel({
  onConfirm,
  onClose,
}: {
  onConfirm: (reason: ReplacementReason | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReplacementReason | null>(null);
  return (
    <Card>
      <Text variant="title3">{t('workout.notPerformedTitle')}</Text>
      <ChoiceGroup
        single
        label={t('workout.notPerformedTitle')}
        options={SHOWN_REPLACEMENT_REASONS.map((r) => ({ value: r, label: t(`workout.replaceReasons.${r}`) }))}
        selected={reason ? [reason] : []}
        onToggle={(r) => setReason(reason === r ? null : r)}
      />
      {reason === 'discomfort' ? (
        <Text color="warning" accessibilityLiveRegion="polite">
          {t('workout.advice.discomfort')}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button label={t('workout.notPerformedConfirm')} onPress={() => onConfirm(reason)} />
        <Button variant="ghost" label={t('workout.cancel')} onPress={onClose} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
