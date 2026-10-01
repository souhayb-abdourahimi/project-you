import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, ChoiceGroup, ConfirmButton, Screen, Text } from '@/components/ui';
import { calendarSupported, useCalendarLink } from '@/features/calendar/useCalendarLink';
import { toIsoDate } from '@/domain/shared/dates';
import { formatDate } from '@/lib/format';

export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const cal = useCalendarLink();
  const yesNo = [
    { value: 'on', label: t('common.yes') },
    { value: 'off', label: t('common.no') },
  ];

  return (
    <Screen>
      <Text color="textMuted">{t('calendar.intro')}</Text>
      {!calendarSupported ? <Banner message={t('calendar.webUnsupported')} /> : null}
      {cal.status === 'denied' ? <Banner message={t('calendar.denied')} /> : null}
      {cal.status === 'error' ? <Banner message={t('calendar.error')} /> : null}

      {!cal.connected ? (
        <Card>
          <Text>{t('calendar.why')}</Text>
          <Button label={t('calendar.connect')} onPress={cal.connect} disabled={!calendarSupported || cal.pending} />
        </Card>
      ) : (
        <>
          <Card>
            <Text variant="heading">{t('calendar.readBusy')}</Text>
            <Text color="textMuted">{t('calendar.readBusyHint')}</Text>
            <ChoiceGroup
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
      )}
    </Screen>
  );
}
