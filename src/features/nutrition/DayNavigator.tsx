import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Card, IconButton, Text } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme';

/** "‹ Mercredi 8 octobre ›": moves between the days of the current meal plan, never outside it. */
export function DayNavigator({
  dates,
  value,
  onChange,
}: {
  dates: readonly string[];
  value: string;
  onChange: (date: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const index = dates.indexOf(value);
  const label = formatDate(value, i18n.language);
  return (
    <Card dense style={styles.row}>
      <IconButton
        icon="back"
        tone="plain"
        label={t('nutrition.previousDay')}
        disabled={index <= 0}
        onPress={() => onChange(dates[index - 1])}
      />
      <Text variant="headline" style={styles.label} accessibilityRole="header">
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </Text>
      <IconButton
        icon="chevron"
        tone="plain"
        label={t('nutrition.nextDay')}
        disabled={index < 0 || index >= dates.length - 1}
        onPress={() => onChange(dates[index + 1])}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  label: { flex: 1, textAlign: 'center' },
});
