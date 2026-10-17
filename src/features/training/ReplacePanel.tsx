import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Icon, RadioList, Text } from '@/components/ui';
import type { TrainingProfile } from '@/domain/profile/schemas';
import { getExercise } from '@/domain/training/exercises';
import { findReplacements, type ReplacementReason } from '@/domain/training/replacement';
import { replacementAdvice, SHOWN_REPLACEMENT_REASONS, type SessionExercise } from '@/domain/training/session';
import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

import { ExerciseMedia } from './ExerciseMedia';

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
    <Card tone="subtle" style={styles.panel}>
      <Text variant="headline">1. {t('workout.replaceTitle')}</Text>
      <RadioList
        label={t('workout.replaceTitle')}
        options={SHOWN_REPLACEMENT_REASONS.map((r) => ({ value: r, label: t(`workout.replaceReasons.${r}`) }))}
        value={reason}
        onChange={setReason}
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
          <Text variant="headline">
            {options.length > 0 ? `2. ${t('workout.alternatives')}` : t('workout.noReplacement')}
          </Text>
          {options.map((o) => (
            <Alternative
              key={o.id}
              id={o.id}
              name={o.name[lang]}
              muscles={o.primary.map((m) => t(`workout.targets.${m}`)).join(', ')}
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

/** One alternative: its picture (validated media or artwork), its name and the muscles it works. */
function Alternative({
  id,
  name,
  muscles,
  onPress,
}: {
  id: string;
  name: string;
  muscles: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityHint={t('workout.choose', { name })}
      onPress={onPress}
      style={({ pressed }) => [
        styles.alternative,
        { backgroundColor: pressed ? colors.surfaceSubtle : colors.surface, borderColor: colors.border },
      ]}>
      <ExerciseMedia exerciseId={id} label={name} size={48} />
      <View style={styles.flex}>
        <Text variant="bodyMedium">{name}</Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {muscles}
        </Text>
      </View>
      <Icon name="chevron" size="sm" color="textMuted" />
    </Pressable>
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
    <Card tone="subtle" style={styles.panel}>
      <Text variant="headline">{t('workout.notPerformedTitle')}</Text>
      <RadioList
        label={t('workout.notPerformedTitle')}
        options={SHOWN_REPLACEMENT_REASONS.map((r) => ({ value: r, label: t(`workout.replaceReasons.${r}`) }))}
        value={reason}
        onChange={(r) => setReason(reason === r ? null : r)}
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
  panel: { gap: spacing.md },
  list: { gap: spacing.sm },
  alternative: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
