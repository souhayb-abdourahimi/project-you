import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, ChoiceGroup, NumberStepper, Text } from '@/components/ui';
import { fromKg, stepIn, toKg } from '@/domain/settings/units';
import { getExercise } from '@/domain/training/exercises';
import type { LoggedSet } from '@/domain/training/progression';
import { SET_FEELS, setFeel, type Prefill, type SessionExercise, type SetFeel } from '@/domain/training/session';
import { useMassUnit } from '@/hooks/useMassUnit';
import { formatNumber } from '@/lib/format';
import { spacing } from '@/theme';

import type { SetInput } from './useSessionController';

const FEELS = Object.keys(SET_FEELS) as SetFeel[];

/**
 * Fast set entry: load and reps (or seconds) with − / +, an optional feel, one obvious button.
 * Opens with the prefill (reliable data only); a correction opens with the set as entered.
 */
export function SetEntry({
  exercise,
  prefill,
  editing,
  onSubmit,
  onDelete,
  onCancel,
}: {
  exercise: SessionExercise;
  prefill: Prefill;
  /** The set being corrected, with its index. */
  editing?: { index: number; set: LoggedSet } | null;
  onSubmit: (input: SetInput) => boolean;
  onDelete?: () => void;
  onCancel?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const unit = useMassUnit();
  const seconds = exercise.unit === 'seconds';
  const loaded = (getExercise(exercise.exerciseId)?.loadIncrementKg ?? 0) > 0;
  const step = getExercise(exercise.exerciseId)?.loadIncrementKg || 2.5;
  const from = editing?.set;
  const [load, setLoad] = useState<number | null>(from ? from.loadKg : prefill.loadKg);
  const [value, setValue] = useState<number | null>(from ? (from.seconds ?? from.reps) : prefill.value);
  const [feel, setFeelValue] = useState<SetFeel | null>(from ? setFeel(from.rpe) : null);
  const [invalid, setInvalid] = useState<'value' | 'load' | null>(null);
  const valueLabel = seconds ? t('workout.seconds') : t('workout.reps');
  const loadLabel = t('workout.load', { unit });

  const submit = () => {
    // A load is never filled in for the user: an empty load on a loaded movement is asked for.
    if (loaded && load === null) return setInvalid('load');
    setInvalid(onSubmit({ loadKg: load ?? 0, value, feel }) ? null : 'value');
  };
  return (
    <View style={styles.root}>
      {editing ? <Text variant="label">{t('workout.editing', { index: editing.index + 1 })}</Text> : null}
      <View style={styles.fields}>
        {loaded || (load ?? 0) > 0 ? (
          <NumberStepper
            label={loadLabel}
            // Typed and shown in the user's unit, kept in kg (converted once each way, D-043).
            value={load === null ? null : fromKg(load, unit)}
            onChange={(v) => setLoad(v === null ? null : toKg(v, unit))}
            step={stepIn(step, unit)}
            decrease={t('workout.decrease', {
              amount: t('workout.stepKg', { value: formatNumber(step, i18n.language) }),
            })}
            increase={t('workout.increase', {
              amount: t('workout.stepKg', { value: formatNumber(step, i18n.language) }),
            })}
          />
        ) : (
          <Text variant="label" color="textMuted" style={styles.bodyweight}>
            {t('workout.bodyweight')}
          </Text>
        )}
        <NumberStepper
          label={valueLabel}
          value={value}
          onChange={setValue}
          step={seconds ? 5 : 1}
          min={1}
          decrease={t('workout.decrease', { amount: t(seconds ? 'workout.stepSeconds' : 'workout.stepReps') })}
          increase={t('workout.increase', { amount: t(seconds ? 'workout.stepSeconds' : 'workout.stepReps') })}
        />
      </View>
      <Text variant="caption" color="textMuted">
        {t('workout.feel.label')}
      </Text>
      <ChoiceGroup
        single
        label={t('workout.feel.label')}
        options={FEELS.map((f) => ({ value: f, label: t(`workout.feel.${f}`) }))}
        selected={feel ? [feel] : []}
        onToggle={(f) => setFeelValue(feel === f ? null : f)}
      />
      {invalid ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {t(invalid === 'load' ? 'workout.loadMissing' : 'workout.invalid')}
        </Text>
      ) : null}
      <Button label={editing ? t('workout.saveCorrection') : t('workout.logSet')} onPress={submit} />
      {editing ? (
        <View style={styles.row}>
          {onDelete ? <Button compact variant="danger" label={t('workout.deleteSet')} onPress={onDelete} /> : null}
          {onCancel ? <Button compact variant="ghost" label={t('workout.cancel')} onPress={onCancel} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  bodyweight: { alignSelf: 'center', minWidth: 120 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
