import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, ConfirmButton, Icon, Notice, SwitchRow, Text, TextField } from '@/components/ui';
import { toIsoDate } from '@/domain/shared/dates';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme';

import type { CalendarFeedModel } from './useCalendarFeed';

/**
 * "Ajouter un calendrier iCal" (D-049): paste, test (with the count of events found), use; then
 * refresh, switch off or delete. Says plainly that only busy times are used.
 */
export function CalendarFeedCard({ feed }: { feed: CalendarFeedModel }) {
  const { t, i18n } = useTranslation();
  const { link, phase, tested, issue } = feed;
  const busy = phase !== 'idle';
  const date = (iso: string) => formatDate(toIsoDate(new Date(iso)), i18n.language);

  // Until the session is read, nothing to say (avoids a flash of "Connecte-toi").
  if (feed.checkingAccount) return null;

  if (!feed.available)
    return (
      <Card style={styles.card}>
        <Title />
        <Text color="textSecondary">{t('calendar.feed.needsAccount')}</Text>
      </Card>
    );

  if (link)
    return (
      <Card style={styles.card}>
        <Title />
        <View style={styles.linked}>
          <Icon name="link" size="sm" color="primary" />
          <Text variant="bodyMedium" style={styles.flex} numberOfLines={1}>
            {link.host}
          </Text>
        </View>
        <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite">
          {link.syncedAt
            ? t('calendar.feed.synced', { date: date(link.syncedAt), count: link.eventCount })
            : t('calendar.feed.neverSynced')}
        </Text>
        {link.issue || issue ? (
          <Notice tone="caution" role="alert" message={t(`calendar.feed.issue.${issue ?? link.issue}`)} />
        ) : null}
        <SwitchRow
          label={t('calendar.feed.use')}
          description={t('calendar.feed.useHint')}
          value={link.enabled}
          onChange={feed.setEnabled}
        />
        <Button
          variant="secondary"
          icon="sync"
          label={t('calendar.feed.refresh')}
          loading={phase === 'refreshing'}
          disabled={busy}
          onPress={feed.refresh}
        />
        <ConfirmButton
          label={t('calendar.feed.remove')}
          message={t('calendar.feed.removeConfirm')}
          loading={phase === 'removing'}
          onConfirm={feed.remove}
        />
        <Text variant="caption" color="textMuted">
          {t('calendar.feed.privacy')}
        </Text>
      </Card>
    );

  return (
    <Card style={styles.card}>
      <Title />
      <Text color="textSecondary">{t('calendar.feed.intro')}</Text>
      <TextField
        label={t('calendar.feed.urlLabel')}
        placeholder="https://…"
        value={feed.url}
        onChangeText={feed.editUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        textContentType="URL"
      />
      {issue ? <Notice tone="caution" role="alert" message={t(`calendar.feed.issue.${issue}`)} /> : null}
      {tested ? (
        <Notice
          tone="positive"
          icon="check"
          title={t('calendar.feed.testedTitle', { host: tested.host })}
          message={
            tested.eventCount > 0
              ? t('calendar.feed.tested', { count: tested.eventCount })
              : t('calendar.feed.testedEmpty')
          }
        />
      ) : null}
      {tested && tested.truncated ? (
        <Text variant="caption" color="textMuted">
          {t('calendar.feed.truncated')}
        </Text>
      ) : null}
      {tested ? (
        <Button block label={t('calendar.feed.save')} loading={phase === 'saving'} disabled={busy} onPress={feed.use} />
      ) : (
        <Button
          block
          variant="secondary"
          label={t('calendar.feed.test')}
          loading={phase === 'testing'}
          disabled={busy || feed.url.trim().length === 0}
          onPress={feed.test}
        />
      )}
      <Text variant="caption" color="textMuted">
        {t('calendar.feed.privacy')}
      </Text>
    </Card>
  );
}

function Title() {
  const { t } = useTranslation();
  return <Text variant="heading">{t('calendar.feed.title')}</Text>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  linked: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
