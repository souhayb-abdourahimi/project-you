import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, ChoiceGroup, Row, Text } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useDataStore } from '@/state/data';
import { spacing } from '@/theme';

import type { ProgramDayView, ProgramSessionView } from './useProgramWeek';
import { SessionStatusLine } from './SessionStatusLine';

/** One day of the Programme screen: rest, or its sessions as planned and lived. */
export function ProgramDay({ day }: { day: ProgramDayView }) {
  const { t, i18n } = useTranslation();
  return (
    <Card muted={day.sessions.length === 0}>
      <Text variant="caption" color={day.when === 'today' ? 'primary' : 'textMuted'}>
        {day.when === 'today'
          ? t('program.todayDate', { date: formatDate(day.date, i18n.language) })
          : formatDate(day.date, i18n.language)}
      </Text>
      {day.sessions.length === 0 ? <Text>{t('program.rest')}</Text> : null}
      {day.sessions.map((s) => (
        <ProgramSession key={s.key} session={s} />
      ))}
    </Card>
  );
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
  ].filter(Boolean);
  return (
    <View style={styles.session}>
      <Text variant="heading">
        {s.focus ? t(`enums.focus.${s.focus}`) : t('program.offPlanSession')}
        {s.slot?.variant === 'short' ? ` · ${t('workout.short')}` : ''}
      </Text>
      {details.length > 0 ? <Text color="textMuted">{details.join(' · ')}</Text> : null}
      {s.extra && s.focus ? <Text color="textMuted">{t('program.extraSession')}</Text> : null}
      {s.adapted ? <Text color="primary">{t(`program.adapted.${s.adapted}`)}</Text> : null}
      <SessionStatusLine status={s.status} movedTo={s.movedTo} replacedBy={s.replacedBy} />
      <Row>
        {s.canOpen ? (
          <Button
            compact
            label={t(s.status === 'planned' || s.status === 'in_progress' ? 'program.open' : 'program.see')}
            onPress={() => router.push(`/workout/${s.date}`)}
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
  session: { gap: spacing.xs },
});
