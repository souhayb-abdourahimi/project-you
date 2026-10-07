import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import type { ExerciseComparison, SessionComparison } from '@/domain/training/compare';
import { DIFFICULTY_LEVELS } from '@/domain/training/program';
import { getExercise } from '@/domain/training/exercises';
import { setValue } from '@/features/training/format';
import { formatDate } from '@/lib/format';
import { MIN_TOUCH, spacing } from '@/theme';

import { SessionStatusLine } from './SessionStatusLine';

/** One session of the history: planned vs done, exercise by exercise, on demand. */
export function SessionFacts({ session: s }: { session: SessionComparison }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const title = [
    formatDate(s.date, i18n.language),
    s.focus ? t(`enums.focus.${s.focus}`) : t('program.offPlanSession'),
    s.variant !== 'full' ? t(`workout.${s.variant}`) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        disabled={s.exercises.length === 0}
        onPress={() => setOpen(!open)}
        style={styles.toggle}>
        <Text variant="label">{title}</Text>
      </Pressable>
      {s.extra ? <Text color="textMuted">{t('program.extraSession')}</Text> : null}
      <SessionStatusLine status={s.status} movedTo={s.movedTo} replacedBy={s.replacedBy} />
      {s.setsPlanned !== null && s.setsDone > 0 ? (
        <Text color="textMuted">{t('history.session.sets', { done: s.setsDone, planned: s.setsPlanned })}</Text>
      ) : null}
      {s.difficulty !== null && DIFFICULTY_LEVELS[s.difficulty - 1] ? (
        <Text color="textMuted">
          {t('history.session.felt', { level: t(`workout.difficulty.${DIFFICULTY_LEVELS[s.difficulty - 1]}`) })}
        </Text>
      ) : null}
      {open ? s.exercises.map((e) => <ExerciseLine key={e.prescribedId} exercise={e} />) : null}
    </View>
  );
}

function ExerciseLine({ exercise: e }: { exercise: ExerciseComparison }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const name = (id: string) => getExercise(id)?.name[lang] ?? id;
  const head = e.replaced
    ? t('history.exercise.replaced', { from: name(e.prescribedId), to: name(e.exerciseId) })
    : name(e.exerciseId);
  const outcome =
    e.outcome === 'not_performed'
      ? t('history.exercise.not_performed', {
          reason: e.notPerformedReason ? t(`workout.replaceReasons.${e.notPerformedReason}`) : t('history.noReason'),
        })
      : e.outcome === 'not_recorded' || e.outcome === 'pending'
        ? t(`history.exercise.${e.outcome}`)
        : e.setsPlanned !== null
          ? t('history.exercise.sets', { done: e.setsDone, planned: e.setsPlanned })
          : t('history.exercise.setsOnly', { count: e.setsDone });
  return (
    <View style={styles.exercise}>
      <Text>
        {head} : {outcome}
      </Text>
      {e.replacedReason ? (
        <Text variant="caption" color="textMuted">
          {t(`workout.replaceReasons.${e.replacedReason}`)}
        </Text>
      ) : null}
      {e.sets.length > 0 ? (
        <Text variant="caption" color="textMuted">
          {e.sets.map((set) => setValue(t, lang, set)).join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  toggle: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  exercise: { paddingLeft: spacing.md },
});
