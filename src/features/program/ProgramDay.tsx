import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, ChoiceGroup, Row, Text } from '@/components/ui';
import { parseSessionKey } from '@/domain/shared/ids';
import { formatDate } from '@/lib/format';
import { useDataStore } from '@/state/data';
import { radius, spacing, useColors } from '@/theme';

import type { ProgramDayView, ProgramSessionView } from './useProgramWeek';
import { SessionStatusLine } from './SessionStatusLine';

/**
 * One day of the Programme screen (W-9 §5), as a timeline: the date on the left, then a rest line
 * or the day's sessions as planned and lived. Today stands out by its date mark, not by colour alone.
 */
export function ProgramDay({ day }: { day: ProgramDayView }) {
  const { t, i18n } = useTranslation();
  const date =
    day.when === 'today'
      ? t('program.todayDate', { date: formatDate(day.date, i18n.language) })
      : formatDate(day.date, i18n.language);
  if (day.sessions.length === 0)
    return (
      <View style={styles.day} accessible accessibilityLabel={`${date}, ${dayRest(day, t)}`}>
        <DateMark date={day.date} today={day.when === 'today'} lang={i18n.language} />
        {/* A past day whose plan is unknown is never called a rest day (W-7.1). */}
        <Text color="textMuted" style={styles.restLine}>
          {dayRest(day, t)}
        </Text>
      </View>
    );
  return (
    <View style={styles.day}>
      <DateMark date={day.date} today={day.when === 'today'} lang={i18n.language} />
      <Card raised={day.when === 'today'} style={styles.card}>
        <Text variant="captionStrong" color={day.when === 'today' ? 'primary' : 'textMuted'}>
          {date}
        </Text>
        {day.prescriptionUnknown ? <Text color="textMuted">{t('program.prescriptionUnknown')}</Text> : null}
        {day.sessions.map((s) => (
          <ProgramSession key={s.key} session={s} />
        ))}
      </Card>
    </View>
  );
}

const dayRest = (day: ProgramDayView, t: (key: string) => string) =>
  day.prescriptionUnknown ? t('program.prescriptionUnknown') : t('program.rest');

/** Short weekday over the day's number; today in a filled pill. Decorative: the row says the date. */
function DateMark({ date, today, lang }: { date: string; today: boolean; lang: string }) {
  const colors = useColors();
  const at = new Date(`${date}T12:00:00`);
  const locale = lang === 'en' ? 'en-GB' : 'fr-FR';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.mark, today && { backgroundColor: colors.primary }]}>
      <Text variant="micro" color={today ? 'onPrimary' : 'textMuted'}>
        {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(at)}
      </Text>
      <Text variant="headline" color={today ? 'onPrimary' : 'textPrimary'}>
        {at.getDate()}
      </Text>
    </View>
  );
}

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
      <Text variant="title3">
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
  day: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  mark: {
    width: 48,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: 2,
  },
  restLine: { flex: 1, paddingVertical: spacing.md + spacing.xxs },
  card: { flex: 1 },
  session: { gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
