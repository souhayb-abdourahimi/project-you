import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, ConfirmButton, EmptyState, Screen, Text } from '@/components/ui';
import { MassField, NumberField } from '@/features/onboarding/fields';
import { isPlausible, useMeasurements, type MeasureRow } from '@/features/settings/useMeasurements';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme';

/**
 * Corriger mes mesures (W-8, D-043): a mistaken weigh-in or measurement is changed or removed.
 * The value itself changes (a typo is not history); trends are derived again from what remains.
 */
export default function MeasurementsScreen() {
  const { t } = useTranslation();
  const { rows, total, correct, remove } = useMeasurements();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Screen>
      <Text color="textMuted">{t('measurements.intro')}</Text>
      {rows.length === 0 ? <EmptyState message={t('measurements.empty')} /> : null}
      {rows.map((row) => (
        <MeasureCard
          key={`${row.kind}:${row.id}`}
          row={row}
          editing={editing === row.id}
          onEdit={() => setEditing(row.id)}
          onDone={() => setEditing(null)}
          onSave={(value) => {
            correct(row, value);
            setEditing(null);
          }}
          onDelete={() => remove(row)}
        />
      ))}
      {total > rows.length ? (
        <Text variant="caption" color="textMuted">
          {t('measurements.more', { count: total - rows.length })}
        </Text>
      ) : null}
    </Screen>
  );
}

function MeasureCard({
  row,
  editing,
  onEdit,
  onDone,
  onSave,
  onDelete,
}: {
  row: MeasureRow;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onSave: (value: number) => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState<number | undefined>(row.value);
  const label = t(`measurements.kind.${row.kind}`);
  const shown = row.kind === 'weight' ? t('common.mass', { value: row.value }) : t('common.cm', { value: row.value });
  const date = formatDate(row.date, i18n.language);
  const valid = isPlausible(row.kind, value);
  return (
    <Card>
      <Text variant="label">
        {label} · {date}
      </Text>
      {editing ? (
        <View style={{ gap: spacing.sm }}>
          {row.kind === 'weight' ? (
            <MassField
              label={(unit) => t('measurements.newValueMass', { unit })}
              valueKg={value}
              onChange={setValue}
              error={valid ? undefined : t('measurements.invalid')}
            />
          ) : (
            <NumberField
              label={t('measurements.newValueCm')}
              value={value}
              onChange={setValue}
              error={valid ? undefined : t('measurements.invalid')}
            />
          )}
          <Button label={t('measurements.save')} disabled={!valid} onPress={() => valid && onSave(value)} />
          <Button variant="ghost" label={t('common.cancel')} onPress={onDone} />
        </View>
      ) : (
        <>
          <Text>{shown}</Text>
          <Button
            compact
            variant="secondary"
            label={t('measurements.edit')}
            accessibilityLabel={t('measurements.editA11y', { item: `${label}, ${date}` })}
            onPress={onEdit}
          />
          <ConfirmButton
            label={t('measurements.delete')}
            accessibilityLabel={t('measurements.deleteA11y', { item: `${label}, ${date}` })}
            confirmLabel={t('measurements.deleteYes')}
            message={t('measurements.deleteConfirm', { item: `${label}, ${date}, ${shown}` })}
            onConfirm={onDelete}
          />
        </>
      )}
    </Card>
  );
}
