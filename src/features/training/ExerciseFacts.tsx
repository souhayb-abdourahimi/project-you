import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { getExercise } from '@/domain/training/exercises';
import { whyKey, type CoachHint, type Performance, type SessionExercise } from '@/domain/training/session';
import { formatNumber } from '@/lib/format';
import { MIN_TOUCH, spacing } from '@/theme';

import { setValue } from './format';

/**
 * What is planned for the current exercise and the real reference points: the target, the load
 * proposed by the stored prescription, last time, one discreet coach line, and "Pourquoi ?".
 */
export function ExerciseFacts({
  exercise,
  last,
  hint,
}: {
  exercise: SessionExercise;
  last: Performance | null;
  hint: CoachHint;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const unit = exercise.unit === 'seconds' ? t('workout.unitSeconds') : t('workout.unitReps');
  return (
    <View style={styles.root}>
      <Text variant="heading" accessibilityRole="text">
        {t('workout.target', {
          sets: exercise.sets,
          min: exercise.repsMin,
          max: exercise.repsMax,
          unit,
          rest: exercise.restSeconds,
        })}
      </Text>
      {exercise.proposedLoadKg !== null && exercise.proposedLoadKg > 0 ? (
        <Text>
          {t('workout.proposed', {
            load: formatNumber(exercise.proposedLoadKg, lang),
            min: exercise.repsMin,
            max: exercise.repsMax,
          })}
        </Text>
      ) : null}
      {last ? <Text>{t('workout.lastTime', { value: setValue(t, lang, last) })}</Text> : null}
      {/* The target is already the line above: the coach only adds a line when it says something new. */}
      {hint.key !== 'target' ? (
        <Text variant="caption" color="textMuted">
          {t(`workout.hint.${hint.key}`, { ...hint.params, unit })}
        </Text>
      ) : null}
      <Why exercise={exercise} />
    </View>
  );
}

/** "Pourquoi cet exercice ?": the stored purpose and load reason, and the exercise cues. */
function Why({ exercise }: { exercise: SessionExercise }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const [open, setOpen] = useState(false);
  const why = whyKey(exercise);
  const info = getExercise(exercise.exerciseId);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.toggle}>
        <Text variant="label" color="primary">
          {t('workout.why.title')}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.why}>
          {why ? <Text>{t(why.key, { target: why.target ? t(`workout.targets.${why.target}`) : '' })}</Text> : null}
          {exercise.progressionReason ? (
            <Text variant="caption" color="textMuted">
              {t('workout.why.load', { reason: t(`reasons.${exercise.progressionReason}`) })}
            </Text>
          ) : null}
          {info ? (
            <>
              <Text variant="caption">
                {t('workout.cues')} : {info.cues[lang]}
              </Text>
              <Text variant="caption" color="textMuted">
                {t('workout.mistakes')} : {info.mistakes[lang]}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  toggle: { minHeight: MIN_TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
  why: { gap: spacing.xs },
});
