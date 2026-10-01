import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, ChoiceGroup, Row, Text } from '@/components/ui';
import type { PrescribedExercise } from '@/domain/training/engine';
import { getExercise } from '@/domain/training/exercises';
import { suggestProgression, type LoggedSet, type SessionLog } from '@/domain/training/progression';
import { findReplacements, type ReplacementReason } from '@/domain/training/replacement';
import type { TrainingProfile } from '@/domain/profile/schemas';
import { NumberField } from '@/features/onboarding/fields';
import { spacing } from '@/theme';

const REASONS: ReplacementReason[] = ['dislike', 'cant_do', 'no_equipment', 'easier', 'harder'];

export function ExerciseCard({
  prescription,
  exerciseId,
  logged,
  history,
  training,
  onLog,
  onSwap,
}: {
  prescription: PrescribedExercise;
  exerciseId: string;
  logged: LoggedSet[];
  history: SessionLog[];
  training: TrainingProfile;
  onLog: (set: LoggedSet) => void;
  /** The reason picked by the user travels with the swap (journey memory, D-028). */
  onSwap: (toId: string, reason: ReplacementReason) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const exercise = getExercise(exerciseId);
  const suggestion = suggestProgression({
    exerciseId,
    repsMin: prescription.repsMin,
    repsMax: prescription.repsMax,
    history,
    fatigue: 'normal',
  });
  const [reps, setReps] = useState<number | undefined>(suggestion.targetReps);
  const [load, setLoad] = useState<number | undefined>(suggestion.loadKg || undefined);
  const [rpe, setRpe] = useState<number | undefined>();
  const [replacing, setReplacing] = useState(false);
  const [noAlternative, setNoAlternative] = useState(false);
  if (!exercise) return null;

  const swap = (reason: ReplacementReason) => {
    const [first] = findReplacements(exerciseId, reason, training);
    if (!first) return setNoAlternative(true);
    setNoAlternative(false);
    setReplacing(false);
    onSwap(first.id, reason);
  };

  const unit = prescription.unit === 'seconds' ? t('workout.unitSeconds') : t('workout.unitReps');
  return (
    <Card>
      <Text variant="heading">{exercise.name[lang]}</Text>
      <Text color="textMuted">
        {t('workout.target', {
          sets: prescription.sets,
          min: prescription.repsMin,
          max: prescription.repsMax,
          unit,
          rest: prescription.restSeconds,
        })}
      </Text>
      {history.length > 0 ? (
        <Text variant="caption">
          {t('workout.suggestion', { load: suggestion.loadKg, reps: suggestion.targetReps })}
        </Text>
      ) : null}
      <Text variant="caption" color="textMuted">
        {t('workout.cues')} : {exercise.cues[lang]} · {t('workout.mistakes')} : {exercise.mistakes[lang]}
      </Text>
      {logged.map((s, i) => (
        <Text key={i} color="success">
          {t('workout.set', { index: i + 1 })} · {s.reps} {unit} {s.loadKg ? `· ${s.loadKg} kg` : ''}{' '}
          {s.rpe ? `· RPE ${s.rpe}` : ''}
        </Text>
      ))}
      {logged.length < prescription.sets ? (
        <View style={{ gap: spacing.sm }}>
          <Row>
            <View style={{ flex: 1, minWidth: 90 }}>
              <NumberField
                label={prescription.unit === 'seconds' ? t('workout.seconds') : t('workout.reps')}
                value={reps}
                onChange={setReps}
              />
            </View>
            {exercise.loadIncrementKg > 0 ? (
              <View style={{ flex: 1, minWidth: 90 }}>
                <NumberField label={t('workout.load')} value={load} onChange={setLoad} />
              </View>
            ) : null}
            <View style={{ flex: 1, minWidth: 90 }}>
              <NumberField label={t('workout.rpe')} value={rpe} onChange={setRpe} />
            </View>
          </Row>
          <Button
            label={t('workout.logSet')}
            disabled={!reps}
            onPress={() =>
              reps && onLog({ reps, loadKg: load ?? 0, rpe: rpe && rpe >= 1 && rpe <= 10 ? rpe : undefined })
            }
          />
        </View>
      ) : null}
      <Button compact variant="ghost" label={t('workout.replace')} onPress={() => setReplacing(!replacing)} />
      {replacing ? (
        <ChoiceGroup
          options={REASONS.map((r) => ({ value: r, label: t(`workout.replaceReasons.${r}`) }))}
          selected={[]}
          onToggle={swap}
        />
      ) : null}
      {noAlternative ? <Text color="textMuted">{t('workout.noReplacement')}</Text> : null}
    </Card>
  );
}
