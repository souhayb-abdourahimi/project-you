import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, ChoiceGroup, Text } from '@/components/ui';
import type { TrainingProfile } from '@/domain/profile/schemas';
import { getExercise } from '@/domain/training/exercises';
import { DIFFICULTY_LEVELS, difficultyLevel } from '@/domain/training/program';
import { spacing } from '@/theme';

import { ExerciseFacts } from './ExerciseFacts';
import { NotPerformedPanel, ReplacePanel } from './ReplacePanel';
import { SetEntry } from './SetEntry';
import { SetList } from './SetList';
import type { SessionController } from './useSessionController';

type Panel = 'replace' | 'skip' | null;

/** The exercise in progress: obvious, big numbers, one primary action at a time. */
export function CurrentExercise({
  controller,
  total,
  training,
}: {
  controller: SessionController;
  total: number;
  training: Pick<TrainingProfile, 'equipment' | 'level' | 'refusedExerciseIds'>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const [panel, setPanel] = useState<Panel>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const { exercise: ex, actions } = controller;
  if (!ex) return null;
  const name = getExercise(ex.exerciseId)?.name[lang] ?? ex.exerciseId;
  const planned = getExercise(ex.prescribedId)?.name[lang] ?? ex.prescribedId;
  const doneAll = ex.today.length >= ex.sets;
  const editSet = editing !== null ? ex.today[editing] : undefined;

  return (
    <Card raised style={styles.card}>
      <Text variant="overline" color="primary">
        {t('workout.header.exerciseOf', { index: ex.index + 1, total })}
      </Text>
      <Text variant="title2">{name}</Text>
      {ex.replaced ? (
        <View style={styles.row}>
          <Text variant="caption" color="textMuted">
            {t('workout.replacedFrom', { name: planned })}
          </Text>
          {ex.today.length === 0 ? (
            <Button compact variant="ghost" label={t('workout.undoReplace')} onPress={actions.undoReplace} />
          ) : null}
        </View>
      ) : null}
      <ExerciseFacts exercise={ex} last={ex.last} hint={ex.hint} />
      <SetList sets={ex.today} editing={editing} onEdit={(i) => setEditing(editing === i ? null : i)} />

      {/* One thing at a time: the replace / skip panel takes the place of the set entry. */}
      {panel !== null ? null : ex.status === 'not_performed' ? (
        <View style={styles.block}>
          <Text variant="headline" color="textMuted">
            {ex.report?.notPerformedReason
              ? t('workout.notPerformedReason', {
                  reason: t(`workout.replaceReasons.${ex.report.notPerformedReason}`),
                })
              : t('workout.status.not_performed')}
          </Text>
          <Button variant="secondary" label={t('workout.undoNotPerformed')} onPress={actions.undoNotPerformed} />
        </View>
      ) : editSet ? (
        <SetEntry
          key={`edit-${ex.exerciseId}-${editing}`}
          exercise={ex}
          prefill={ex.prefill}
          editing={{ index: editing!, set: editSet }}
          onSubmit={(input) => {
            const ok = actions.editSet(editing!, input);
            if (ok) setEditing(null);
            return ok;
          }}
          onDelete={() => {
            actions.deleteSet(editing!);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : doneAll ? (
        <View style={styles.block}>
          <Text variant="headline" color="success">
            {t('workout.exerciseDone')}
          </Text>
          <Text variant="caption" color="textMuted">
            {t('workout.exerciseDifficulty')}
          </Text>
          <ChoiceGroup
            single
            label={t('workout.exerciseDifficulty')}
            options={DIFFICULTY_LEVELS.map((l) => ({ value: l, label: t(`workout.difficulty.${l}`) }))}
            selected={ex.report?.difficulty ? [difficultyLevel(ex.report.difficulty)!] : []}
            onToggle={actions.rateExercise}
          />
          {controller.progress.current !== null ? <Button label={t('workout.next')} onPress={actions.next} /> : null}
        </View>
      ) : (
        <SetEntry
          key={`new-${ex.exerciseId}-${ex.today.length}`}
          exercise={ex}
          prefill={ex.prefill}
          onSubmit={actions.logSet}
        />
      )}

      {/* Once a set is done, its sets belong to this exercise: no replacement, no "not performed". */}
      {panel === null && ex.status === 'pending' ? (
        <View style={styles.row}>
          <Button compact variant="ghost" label={t('workout.replace')} onPress={() => setPanel('replace')} />
          <Button compact variant="ghost" label={t('workout.notPerformed')} onPress={() => setPanel('skip')} />
        </View>
      ) : null}
      {panel === 'replace' ? (
        <ReplacePanel
          exercise={ex}
          training={training}
          onReplace={(toId, reason) => {
            actions.replace(toId, reason);
            setPanel(null);
          }}
          onSkip={(reason) => {
            actions.notPerformed(reason);
            setPanel(null);
          }}
          onEndSession={() => actions.finish('pain')}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === 'skip' ? (
        <NotPerformedPanel
          onConfirm={(reason) => {
            actions.notPerformed(reason);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  block: { gap: spacing.sm },
});
