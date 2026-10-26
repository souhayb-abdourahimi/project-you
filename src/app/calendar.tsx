import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, ChoiceGroup, ConfirmButton, Screen, Text } from '@/components/ui';
import { CalendarFeedCard } from '@/features/calendar/CalendarFeedCard';
import { useCalendarFeed } from '@/features/calendar/useCalendarFeed';
import { calendarSupported, useCalendarLink } from '@/features/calendar/useCalendarLink';
import { toIsoDate } from '@/domain/shared/dates';
import { formatDate } from '@/lib/format';

/**
 * Calendrier: manual availability (always), an iCal link (any platform with an account, D-049) and,
 * in the native app, the device calendar. No dead button: on the web the device calendar is only
 * mentioned in one line.
 */
export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const cal = useCalendarLink();
  const feed = useCalendarFeed();
  const yesNo = [
    { value: 'on', label: t('common.yes') },
    { value: 'off', label: t('common.no') },
  ];

  return (
    <Screen>
      <Text color="textMuted">{t(calendarSupported ? 'calendar.intro' : 'calendar.introWeb')}</Text>

      <Card>
        <Text variant="heading">{t('calendar.manualTitle')}</Text>
        <Text color="textSecondary">{t('calendar.manualBody')}</Text>
        <Button
          variant="secondary"
          label={t('calendar.editAvailability')}
          onPress={() => router.push('/settings/schedule')}
        />
      </Card>

      <CalendarFeedCard feed={feed} />

      {!calendarSupported ? (
        <Text variant="caption" color="textMuted">
          {t('calendar.nativeLater')}
        </Text>
      ) : null}
      {calendarSupported && cal.status === 'denied' ? <Banner message={t('calendar.denied')} /> : null}
      {calendarSupported && cal.status === 'error' ? <Banner message={t('calendar.error')} /> : null}

      {calendarSupported && !cal.connected ? (
        <Card>
          <Text variant="heading">{t('calendar.deviceTitle')}</Text>
          <Text color="textSecondary">{t('calendar.why')}</Text>
          <Button label={t('calendar.connect')} onPress={cal.connect} loading={cal.pending} />
        </Card>
      ) : null}
      {calendarSupported && cal.connected ? (
        <>
          <Card>
            <Text variant="heading">{t('calendar.readBusy')}</Text>
            <Text color="textMuted">{t('calendar.readBusyHint')}</Text>
            <ChoiceGroup
              single
              label={t('calendar.readBusy')}
              options={yesNo}
              selected={[cal.readBusy ? 'on' : 'off']}
              onToggle={(v) => cal.update({ readBusy: v === 'on', busy: v === 'on' ? cal.busy : null })}
            />
            {cal.readBusy && cal.busy ? (
              <Text variant="caption" color="textMuted">
                {t('calendar.lastRead', {
                  date: formatDate(toIsoDate(new Date(cal.busy.readAt)), i18n.language),
                  count: cal.busy.slots.length,
                })}
              </Text>
            ) : null}
          </Card>
          <Card>
            <Text variant="heading">{t('calendar.writeSessions')}</Text>
            <Text color="textMuted">{t('calendar.writeSessionsHint')}</Text>
            <ChoiceGroup
              single
              label={t('calendar.writeSessions')}
              options={yesNo}
              selected={[cal.writeSessions ? 'on' : 'off']}
              onToggle={(v) => cal.update({ writeSessions: v === 'on' })}
            />
          </Card>
          <Card>
            <Text color="textMuted">{t('calendar.disconnectHint')}</Text>
            <ConfirmButton
              label={t('calendar.disconnect')}
              message={t('calendar.disconnectConfirm')}
              onConfirm={cal.disconnect}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
