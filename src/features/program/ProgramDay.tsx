import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, ChoiceGroup, Icon, Row, Text } from '@/components/ui';
import { parseSessionKey } from '@/domain/shared/ids';
import { formatDate } from '@/lib/format';
import { useDataStore } from '@/state/data';
import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

import type { ProgramDayView, ProgramSessionView } from './useProgramWeek';
import { SessionStatusLine } from './SessionStatusLine';

/**
 * The selected day of the Programme screen (W-10): its date, then a rest line or the day's sessions
 * as planned and lived, with their actions. Today is said in words, not by colour alone.
 */
export function ProgramDayCard({ day }: { day: ProgramDayView }) {
  const { t, i18n } = useTranslation();
  const date =
    day.when === 'today'
      ? t('program.todayDate', { date: formatDate(day.date, i18n.language) })
      : formatDate(day.date, i18n.language);
  return (
    <Card raised style={styles.card}>
      <Text variant="captionStrong" color={day.when === 'today' ? 'primary' : 'textMuted'}>
        {date}
      </Text>
      {day.sessions.length === 0 ? (
        // A past day whose plan is unknown is never called a rest day (W-7.1).
        <View style={styles.restRow}>
          <Icon name="rest" size="md" color="textMuted" />
          <Text color="textSecondary">{dayRest(day, t)}</Text>
        </View>
      ) : (
        <>
          {day.prescriptionUnknown ? <Text color="textMuted">{t('program.prescriptionUnknown')}</Text> : null}
          {day.sessions.map((s) => (
            <ProgramSession key={s.key} session={s} />
          ))}
        </>
      )}
    </Card>
  );
}

const DONE = ['completed', 'partial', 'stopped'];

/**
 * One day with sessions in the week list: a status mark, the weekday, the focus and where it
 * stands (the same fact line as the card), a chevron. Selecting it shows the day above.
 */
export function WeekDayRow({ day, selected, onPress }: { day: ProgramDayView; selected: boolean; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const first = day.sessions[0];
  const done = day.sessions.some((s) => DONE.includes(s.status));
  const weekday = formatDate(day.date, i18n.language).split(' ')[0];
  const focus = day.sessions
    .map((s) => (s.focus ? t(`enums.focus.${s.focus}`) : t('program.offPlanSession')))
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${formatDate(day.date, i18n.language)}, ${focus}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.weekRow,
        { backgroundColor: selected ? colors.primarySubtle : pressed ? colors.surfaceSubtle : 'transparent' },
      ]}>
      <View style={[styles.status, { backgroundColor: done ? colors.success : colors.surfaceSubtle }]}>
        <Icon name={done ? 'check' : 'workout'} size="sm" color={done ? 'surface' : 'training'} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyMedium">{weekday.charAt(0).toUpperCase() + weekday.slice(1)}</Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {focus}
        </Text>
        {first && first.status !== 'planned' ? (
          <SessionStatusLine status={first.status} movedTo={first.movedTo} replacedBy={first.replacedBy} compact />
        ) : null}
      </View>
      <Icon name="chevron" size="sm" color="textMuted" />
    </Pressable>
  );
}

const dayRest = (day: ProgramDayView, t: (key: string) => string) =>
  day.prescriptionUnknown ? t('program.prescriptionUnknown') : t('program.rest');

/** The route of one session: its own key (date and slot), whatever the other sessions of the day. */
function sessionParams(key: string) {
  const { date, sessionIndex } = parseSessionKey(key);
  return { date, index: String(sessionIndex) };
}

function ProgramSession({ session: s }: { session: ProgramSessionView }) {
  const { t, i18n } = useTranslation();
  const [moving, setMoving] = useState(false);
  const reschedule = useDataStore((st) => st.reschedule);
  const details = [
    s.slot?.start ? `${s.slot.start}–${s.slot.end}` : null,
    s.slot ? t(`enums.location.${s.slot.location}`) : null,
    s.exerciseCount ? t('program.exercises', { count: s.exerciseCount }) : null,
    s.minutes ? t('program.estimated', { count: s.minutes }) : null,
  ].filter((d): d is string => !!d);
  return (
    <View style={styles.session}>
      <Text variant="title2">
        {s.focus ? t(`enums.focus.${s.focus}`) : t('program.offPlanSession')}
        {s.slot?.variant === 'short' ? ` · ${t('workout.short')}` : ''}
      </Text>
      {details.length > 0 ? (
        <View style={styles.badges} accessible accessibilityLabel={details.join(', ')}>
          {details.map((d) => (
            <Badge key={d} label={d} />
          ))}
        </View>
      ) : null}
      {s.extra && s.focus ? <Text color="textMuted">{t('program.extraSession')}</Text> : null}
      {s.adapted ? <Text color="primary">{t(`program.adapted.${s.adapted}`)}</Text> : null}
      <SessionStatusLine status={s.status} movedTo={s.movedTo} replacedBy={s.replacedBy} />
      <Row>
        {s.canOpen ? (
          <Button
            compact
            label={t(s.status === 'planned' || s.status === 'in_progress' ? 'program.open' : 'program.see')}
            onPress={() =>
              router.push({
                pathname: '/workout/[date]',
                // Each session opens itself (a day can hold two, W-7.1).
                params: sessionParams(s.key),
              })
            }
          />
        ) : null}
        {s.moveTo.length > 0 ? (
          <Button
            compact
            variant="secondary"
            label={t('program.move')}
            expanded={moving}
            onPress={() => setMoving(!moving)}
          />
        ) : null}
      </Row>
      {moving ? (
        <ChoiceGroup
          single
          label={t('program.moveTo')}
          options={s.moveTo.map((d) => ({ value: d, label: formatDate(d, i18n.language) }))}
          selected={[]}
          onToggle={(to) => {
            reschedule(s.date, to);
            setMoving(false);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm + spacing.xxs },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  weekRow: {
    minHeight: MIN_TOUCH + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  status: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  session: { gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
