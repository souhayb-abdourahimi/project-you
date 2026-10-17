import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

import type { ProgramDayView } from './useProgramWeek';

const DONE = ['completed', 'partial', 'stopped'];

/**
 * The week as a horizontal strip (W-10 reference): short weekday over the day number, today in a
 * filled blue pill, the selected day outlined, a dot under a day with a session (green once done).
 * Each day is a tab; its accessible name says the date and what it holds.
 */
export function WeekStrip({
  days,
  selected,
  onSelect,
}: {
  days: readonly ProgramDayView[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';
  return (
    <View accessibilityRole="tablist" accessibilityLabel={t('program.week')} style={styles.row}>
      {days.map((day) => {
        const at = new Date(`${day.date}T12:00:00`);
        const today = day.when === 'today';
        const isSelected = day.date === selected;
        const has = day.sessions.length > 0;
        const done = has && day.sessions.some((s) => DONE.includes(s.status));
        const what = has ? t('program.strip.sessions', { count: day.sessions.length }) : t('program.rest');
        return (
          <Pressable
            key={day.date}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            aria-selected={isSelected}
            accessibilityLabel={`${today ? t('program.todayDate', { date: formatDate(day.date, i18n.language) }) : formatDate(day.date, i18n.language)}, ${what}`}
            onPress={() => onSelect(day.date)}
            style={styles.day}>
            <Text variant="micro" color={today ? 'primary' : 'textMuted'}>
              {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(at).replace('.', '')}
            </Text>
            <View
              style={[
                styles.pill,
                today && { backgroundColor: colors.primary },
                !today && isSelected && { borderColor: colors.primary, borderWidth: 1.5 },
              ]}>
              <Text variant="headline" color={today ? 'onPrimary' : isSelected ? 'primary' : 'textPrimary'}>
                {at.getDate()}
              </Text>
            </View>
            <View
              style={[styles.dot, { backgroundColor: has ? (done ? colors.success : colors.primary) : 'transparent' }]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { flex: 1, alignItems: 'center', gap: spacing.xs, minHeight: MIN_TOUCH },
  pill: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'transparent',
    borderWidth: 1.5,
  },
  dot: { width: 5, height: 5, borderRadius: radius.pill },
});
