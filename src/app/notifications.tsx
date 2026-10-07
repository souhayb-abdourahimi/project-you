import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, ChoiceGroup, Screen, SwitchRow, Text, TextField } from '@/components/ui';
import {
  MAX_PER_DAY_CHOICES,
  NOTIFICATION_CATEGORIES,
  PAUSE_DAYS,
  type NotificationPreferences,
} from '@/domain/notifications/types';
import { addDays, toIsoDate } from '@/domain/shared/dates';
import { formatDate } from '@/lib/format';
import { notificationsSupported, requestNotificationPermission } from '@/services/notifications';
import { useNotificationStore } from '@/state/notifications';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const COACH_OPTIONS = ['quotePersonalWords', 'absenceReminders', 'celebrations'] as const;

type TimeKey = 'quietStart' | 'quietEnd' | 'mealReminderTime' | 'motivationTime' | 'weighInTime';

/** Keeps what the user types; only a valid HH:MM is saved. */
function TimeField(props: { label: string; value: string; error: string; hint: string; onValid: (v: string) => void }) {
  const [text, setText] = useState(props.value);
  return (
    <TextField
      label={props.label}
      hint={props.hint}
      value={text}
      onChangeText={(v) => {
        setText(v);
        if (TIME.test(v)) props.onValid(v);
      }}
      keyboardType="numbers-and-punctuation"
      inputMode="numeric"
      maxLength={5}
      error={TIME.test(text) ? undefined : props.error}
    />
  );
}

/**
 * Notifications (W-8, D-043). Every switch matches real reminders of the journey's channel
 * (docs/NOTIFICATIONS.md); the choices are the account's (synced), the permission is this device's.
 * Safety messages are not a category: they cannot be switched off (CLAUDE.md rule 8).
 */
export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const { prefs, permission, update, toggleCategory, setPermission } = useNotificationStore();

  const allowOnThisDevice = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    return result;
  };
  const setEnabled = async (on: boolean) => {
    if (!on) return update({ enabled: false });
    const result = permission === 'granted' ? 'granted' : await allowOnThisDevice();
    update({ enabled: result === 'granted' });
  };

  const timeField = (key: TimeKey) => (
    <TimeField
      key={key}
      label={t(`notifications.fields.${key}`)}
      hint={t('notifications.timeHint')}
      value={prefs[key]}
      error={t('notifications.invalidTime')}
      onValid={(v) => update({ [key]: v } as Partial<NotificationPreferences>)}
    />
  );

  const today = toIsoDate(new Date());
  const paused = prefs.pausedUntil !== null && prefs.pausedUntil > today;
  const sameQuiet = prefs.quietEnabled && prefs.quietStart === prefs.quietEnd;

  return (
    <Screen>
      <Text color="textMuted">{t('notifications.intro')}</Text>
      {!notificationsSupported ? <Banner message={t('notifications.webUnsupported')} /> : null}
      {permission === 'denied' ? <Banner message={t('notifications.denied')} /> : null}
      <Card>
        <SwitchRow
          label={t('notifications.master')}
          description={t('notifications.masterHint')}
          value={prefs.enabled}
          disabled={!notificationsSupported}
          onChange={(on) => void setEnabled(on)}
        />
        {prefs.enabled && notificationsSupported && permission !== 'granted' ? (
          <>
            <Text color="textMuted">{t('notifications.deviceNotAllowed')}</Text>
            <Button variant="secondary" label={t('notifications.allowDevice')} onPress={() => void allowOnThisDevice()} />
          </>
        ) : null}
      </Card>
      <Card>
        <Text variant="heading">{t('notifications.categoriesTitle')}</Text>
        {NOTIFICATION_CATEGORIES.map((c) => (
          <SwitchRow
            key={c}
            label={t(`notifications.categories.${c}`)}
            description={t(`notifications.categoryHints.${c}`)}
            value={prefs.categories[c]}
            onChange={() => toggleCategory(c)}
          />
        ))}
        <Text variant="caption" color="textMuted">
          {t('notifications.safetyHint')}
        </Text>
      </Card>
      <Card>
        <Text variant="heading">{t('notifications.coachTitle')}</Text>
        <Text color="textMuted">{t('notifications.coachIntro')}</Text>
        {COACH_OPTIONS.map((o) => (
          <SwitchRow
            key={o}
            label={t(`notifications.coachOptions.${o}`)}
            description={t(`notifications.coachHints.${o}`)}
            value={prefs[o]}
            onChange={(v) => update({ [o]: v })}
          />
        ))}
      </Card>
      <Card>
        <Text variant="heading">{t('notifications.pauseTitle')}</Text>
        {paused ? (
          <>
            <Text>{t('notifications.pausedUntil', { date: formatDate(prefs.pausedUntil!, i18n.language) })}</Text>
            <Button variant="secondary" label={t('notifications.resume')} onPress={() => update({ pausedUntil: null })} />
          </>
        ) : (
          <>
            <Text color="textMuted">{t('notifications.pauseHint')}</Text>
            {PAUSE_DAYS.map((days) => (
              <Button
                key={days}
                variant="secondary"
                label={t('notifications.pauseFor', { count: days })}
                onPress={() => update({ pausedUntil: addDays(today, days) })}
              />
            ))}
          </>
        )}
      </Card>
      <Card>
        <Text variant="heading">{t('notifications.quietTitle')}</Text>
        <SwitchRow
          label={t('notifications.quietSwitch')}
          description={t('notifications.quietHint', { start: prefs.quietStart, end: prefs.quietEnd })}
          value={prefs.quietEnabled}
          onChange={(quietEnabled) => update({ quietEnabled })}
        />
        {prefs.quietEnabled ? (
          <>
            {timeField('quietStart')}
            {timeField('quietEnd')}
          </>
        ) : null}
        {sameQuiet ? <Text color="danger">{t('notifications.quietSame')}</Text> : null}
      </Card>
      <Card>
        <Text variant="heading">{t('notifications.limitsTitle')}</Text>
        <Text variant="label">{t('notifications.fields.maxPerDay')}</Text>
        <ChoiceGroup
          single
          label={t('notifications.fields.maxPerDay')}
          options={MAX_PER_DAY_CHOICES.map((n) => ({ value: String(n), label: String(n) }))}
          selected={[String(prefs.maxPerDay)]}
          onToggle={(v) => update({ maxPerDay: Number(v) })}
        />
      </Card>
      <Card>
        <Text variant="heading">{t('notifications.timesTitle')}</Text>
        {timeField('mealReminderTime')}
        {timeField('motivationTime')}
        <Text variant="label">{t('notifications.fields.weighInDay')}</Text>
        <ChoiceGroup
          single
          label={t('notifications.fields.weighInDay')}
          options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: t(`coachDay.weekday.${d}`) }))}
          selected={[prefs.weighInDay]}
          onToggle={(weighInDay) => update({ weighInDay })}
        />
        {timeField('weighInTime')}
      </Card>
    </Screen>
  );
}
