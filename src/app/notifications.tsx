import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, ChoiceGroup, Screen, Text, TextField } from '@/components/ui';
import { NOTIFICATION_CATEGORIES } from '@/domain/notifications/engine';
import { notificationsSupported, requestNotificationPermission } from '@/services/notifications';
import { useNotificationStore } from '@/state/notifications';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type TimeKey = 'quietStart' | 'quietEnd' | 'mealReminderTime' | 'motivationTime' | 'weighInTime';

/** Keeps what the user types; only a valid HH:MM is saved. */
function TimeField(props: { label: string; value: string; error: string; onValid: (v: string) => void }) {
  const [text, setText] = useState(props.value);
  return (
    <TextField
      label={props.label}
      value={text}
      onChangeText={(v) => {
        setText(v);
        if (TIME.test(v)) props.onValid(v);
      }}
      keyboardType="numbers-and-punctuation"
      error={TIME.test(text) ? undefined : props.error}
    />
  );
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const { prefs, permission, update, toggleCategory, setPermission } = useNotificationStore();

  const enable = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    update({ enabled: result === 'granted' });
  };

  const timeField = (key: TimeKey) => (
    <TimeField
      key={key}
      label={t(`notifications.fields.${key}`)}
      value={prefs[key]}
      error={t('notifications.invalidTime')}
      onValid={(v) => update({ [key]: v })}
    />
  );

  return (
    <Screen>
      <Text color="textMuted">{t('notifications.intro')}</Text>
      {!notificationsSupported ? <Banner message={t('notifications.webUnsupported')} /> : null}
      {permission === 'denied' ? <Banner message={t('notifications.denied')} /> : null}
      <Card>
        {prefs.enabled ? (
          <Button variant="secondary" label={t('notifications.disable')} onPress={() => update({ enabled: false })} />
        ) : (
          <Button label={t('notifications.enable')} onPress={enable} disabled={!notificationsSupported} />
        )}
      </Card>
      <Card>
        <Text variant="heading">{t('notifications.categoriesTitle')}</Text>
        <ChoiceGroup
          options={NOTIFICATION_CATEGORIES.map((c) => ({ value: c, label: t(`notifications.categories.${c}`) }))}
          selected={NOTIFICATION_CATEGORIES.filter((c) => prefs.categories[c])}
          onToggle={(c) => toggleCategory(c as (typeof NOTIFICATION_CATEGORIES)[number])}
        />
        <Text variant="caption" color="textMuted">
          {t('notifications.calendarHint')}
        </Text>
      </Card>
      <Card>
        <Text variant="heading">{t('notifications.limitsTitle')}</Text>
        <Text variant="label">{t('notifications.fields.maxPerDay')}</Text>
        <ChoiceGroup
          options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
          selected={[String(prefs.maxPerDay)]}
          onToggle={(v) => update({ maxPerDay: Number(v) })}
        />
        {timeField('quietStart')}
        {timeField('quietEnd')}
      </Card>
      <Card>
        <Text variant="heading">{t('notifications.timesTitle')}</Text>
        {timeField('mealReminderTime')}
        {timeField('motivationTime')}
        {timeField('weighInTime')}
      </Card>
    </Screen>
  );
}
