import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { explainExercise, explainLoad } from '@/domain/journey/explain';
import { getExercise } from '@/domain/training/exercises';
import type { CoachHint, Performance, SessionExercise } from '@/domain/training/session';
import { formatNumber } from '@/lib/format';
import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

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
  const plan = planKey(exercise);
  const colors = useColors();
  const target = t('workout.target', {
    sets: exercise.sets,
    min: exercise.repsMin,
    max: exercise.repsMax,
    unit,
    rest: exercise.restSeconds,
  });
  return (
    <View style={styles.root}>
      {/* The prescription as three facts (W-10 reference); read as one sentence. */}
      <View accessible accessibilityLabel={target} style={[styles.strip, { borderColor: colors.border }]}>
        <Fact label={t('workout.facts.sets')} value={String(exercise.sets)} />
        <Fact
          label={exercise.unit === 'seconds' ? t('workout.facts.seconds') : t('workout.facts.reps')}
          value={exercise.repsMin === exercise.repsMax ? `${exercise.repsMin}` : `${exercise.repsMin}–${exercise.repsMax}`}
        />
        <Fact label={t('workout.facts.rest')} value={restLabel(exercise.restSeconds, t)} />
      </View>
      <View style={styles.tiles}>
        {hasProposal(exercise) ? (
          <Tile label={t('workout.facts.proposed')}>
            <Proposed exercise={exercise} unit={unit} />
          </Tile>
        ) : null}
        {last ? (
          <Tile label={t('workout.facts.last')}>
            <Text variant="headline">{setValue(t, lang, last)}</Text>
          </Tile>
        ) : null}
      </View>
      {/* The stored decision in one line (W-4); a hold of the day (fatigue, safety) says it instead. */}
      {plan && hint.key !== 'keep_load' ? (
        <Text variant="caption" color="textMuted">
          {t(`workout.plan.${plan}`)}
        </Text>
      ) : null}
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

const restLabel = (seconds: number, t: (key: string, params?: Record<string, unknown>) => string) =>
  seconds >= 60 && seconds % 60 === 0
    ? t('workout.facts.restMinutes', { count: seconds / 60 })
    : t('workout.facts.restSeconds', { count: seconds });

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="headline">{value}</Text>
    </View>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surfaceSubtle }]}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      {children}
    </View>
  );
}

/** Numbers of a reason in the user's locale ("2,5 kg"). */
const localized = (params: Record<string, number | string> | null, lang: 'fr' | 'en') =>
  Object.fromEntries(
    Object.entries(params ?? {}).map(([k, v]) => [k, typeof v === 'number' ? formatNumber(v, lang) : v]),
  );

/** The short line of a W-4 decision (older prescriptions have none). */
function planKey(ex: SessionExercise): string | null {
  switch (ex.progressionAction) {
    case 'increase_load':
    case 'maintain':
    case 'retry':
    case 'reduce_load':
      return ex.progressionAction;
    case 'increase_reps':
      return ex.unit === 'seconds' ? 'increase_seconds' : 'increase_reps';
    default:
      return null;
  }
}

const hasProposal = (exercise: SessionExercise) =>
  exercise.targetReps !== null || (exercise.proposedLoadKg !== null && exercise.proposedLoadKg > 0);

/** What the prescription proposes: the load and the goal per set (W-4), or the range before W-4. */
function Proposed({ exercise, unit }: { exercise: SessionExercise; unit: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const load = exercise.proposedLoadKg !== null && exercise.proposedLoadKg > 0 ? exercise.proposedLoadKg : null;
  if (exercise.targetReps !== null) {
    return (
      <Text variant="headline">
        {load !== null
          ? t('workout.goalLoad', { load: formatNumber(load, lang), target: exercise.targetReps, unit })
          : t('workout.goal', { target: exercise.targetReps, unit })}
      </Text>
    );
  }
  if (load === null) return null;
  return (
    <Text variant="headline">
      {t('workout.proposed', { load: formatNumber(load, lang), min: exercise.repsMin, max: exercise.repsMax })}
    </Text>
  );
}

/**
 * "Pourquoi cet exercice ?" and "Pourquoi cette charge ?" (W-6): the structured answers of
 * `journey/explain.ts`, read from the stored prescription, and the exercise cues.
 */
function Why({ exercise }: { exercise: SessionExercise }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const [open, setOpen] = useState(false);
  const why = explainExercise(exercise);
  const load = explainLoad(exercise, exercise.replaced);
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
          {why ? (
            <Text>{t(why.key, { target: why.params.target ? t(`workout.targets.${why.params.target}`) : '' })}</Text>
          ) : null}
          {load ? (
            <>
              <Text variant="caption" color="textMuted">
                {t('workout.why.load', { reason: t(load.key, localized(load.params, lang)) })}
              </Text>
              {load.confidence ? (
                <Text variant="caption" color="textMuted">
                  {t(`workout.why.confidence.${load.confidence}`)}
                </Text>
              ) : null}
              <Text variant="caption" color="textMuted">
                {t('daily.basedOn', { data: load.dataUsed.map((d) => t(`reasons.${d}`)).join(', ') })}
              </Text>
            </>
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
  root: { gap: spacing.sm },
  strip: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  fact: { flex: 1, gap: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flex: 1, minWidth: 140, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  toggle: { minHeight: MIN_TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
  why: { gap: spacing.xs },
});
