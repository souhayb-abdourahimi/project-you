import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, ChoiceGroup, EmptyState, Row, Text, TextField } from '@/components/ui';
import { TimeSlot, type LabeledSlot } from '@/domain/profile/schemas';
import { spacing } from '@/theme';

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function SlotForm({
  withLabel,
  onAdd,
  addLabel,
}: {
  withLabel: boolean;
  onAdd: (slots: LabeledSlot[]) => void;
  addLabel: string;
}) {
  const { t } = useTranslation();
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | undefined>();

  const add = () => {
    const slots = days.map((day) => ({
      day,
      start: start.trim(),
      end: end.trim(),
      ...(withLabel && label ? { label } : {}),
    }));
    if (slots.length === 0 || !slots.every((s) => TimeSlot.safeParse(s).success)) {
      setError(t('onboarding.schedule.availability.invalid'));
      return;
    }
    onAdd(slots);
    setError(undefined);
    setDays([]);
  };

  return (
    <Card muted>
      <Text variant="label">{t('onboarding.schedule.availability.day')}</Text>
      <ChoiceGroup
        options={DAYS.map((d) => ({ value: d, label: t(`enums.weekdayShort.${d}`) }))}
        selected={days}
        onToggle={(d) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
      />
      <Row>
        <View style={{ flex: 1, minWidth: 120 }}>
          <TextField
            label={t('onboarding.schedule.availability.from')}
            value={start}
            onChangeText={setStart}
            placeholder="17:00"
          />
        </View>
        <View style={{ flex: 1, minWidth: 120 }}>
          <TextField
            label={t('onboarding.schedule.availability.to')}
            value={end}
            onChangeText={setEnd}
            placeholder="19:00"
            error={error}
          />
        </View>
      </Row>
      {withLabel ? (
        <TextField label={t('onboarding.schedule.availability.label')} value={label} onChangeText={setLabel} />
      ) : null}
      <Button variant="secondary" label={addLabel} onPress={add} />
    </Card>
  );
}

function SlotList({ slots, onRemove }: { slots: LabeledSlot[]; onRemove: (index: number) => void }) {
  const { t } = useTranslation();
  if (slots.length === 0) return <EmptyState message={t('onboarding.schedule.availability.empty')} />;
  return (
    <View style={{ gap: spacing.xs }}>
      {slots.map((s, i) => (
        <Row key={`${s.day}-${s.start}-${i}`}>
          <Text style={{ flex: 1 }}>
            {t(`enums.weekday.${s.day}`)} {s.start}–{s.end} {s.label ? `· ${s.label}` : ''}
          </Text>
          <Button compact variant="ghost" label={t('common.delete')} onPress={() => onRemove(i)} />
        </Row>
      ))}
    </View>
  );
}

export function ScheduleEditor({
  availability,
  constraints,
  onChange,
}: {
  availability: LabeledSlot[];
  constraints: LabeledSlot[];
  onChange: (next: { availability: LabeledSlot[]; fixedConstraints: LabeledSlot[] }) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: spacing.lg }}>
      <Text variant="heading">{t('onboarding.schedule.availability.free')}</Text>
      <SlotList
        slots={availability}
        onRemove={(i) =>
          onChange({ availability: availability.filter((_, j) => j !== i), fixedConstraints: constraints })
        }
      />
      <SlotForm
        withLabel={false}
        addLabel={t('onboarding.schedule.availability.addFree')}
        onAdd={(slots) => onChange({ availability: [...availability, ...slots], fixedConstraints: constraints })}
      />
      <Text variant="heading">{t('onboarding.schedule.availability.busy')}</Text>
      <SlotList
        slots={constraints}
        onRemove={(i) => onChange({ availability, fixedConstraints: constraints.filter((_, j) => j !== i) })}
      />
      <SlotForm
        withLabel
        addLabel={t('onboarding.schedule.availability.addBusy')}
        onAdd={(slots) => onChange({ availability, fixedConstraints: [...constraints, ...slots] })}
      />
    </View>
  );
}
