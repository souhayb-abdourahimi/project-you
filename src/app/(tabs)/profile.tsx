import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Card, Icon, ListGroup, ListRow, Screen, ScreenHeader, Text } from '@/components/ui';
import { SETTINGS_SECTIONS } from '@/domain/settings/sections';
import { sectionSummary } from '@/features/settings/summaries';
import { useNotificationStore } from '@/state/notifications';
import { useProfileStore } from '@/state/profile';
import { SECTION_ICON } from '@/features/settings/icons';
import { PRESSED_SCALE, spacing } from '@/theme';

/**
 * Profil (W-9 navigation): who you are and what the coach works from, in a few grouped rows. Every
 * row opens the screen that already owns the setting (D-043, docs/SETTINGS_ARCHITECTURE.md): this
 * tab only gathers and summarises, it stores nothing.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const snapshot = useProfileStore((s) => s.snapshot);
  const notificationsOn = useNotificationStore((s) => s.prefs.enabled);
  const year = new Date().getFullYear();
  if (!snapshot) return null;
  const name = snapshot.user.displayName;
  const summary = t('profile.summary', {
    goal: t(`enums.goal.${snapshot.goal.type}`),
    count: snapshot.training.sessionsPerWeek,
  });

  return (
    <Screen airy>
      <ScreenHeader title={t('profile.title')} />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${name}, ${summary}`}
        onPress={() => router.push('/settings/goal')}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? PRESSED_SCALE : 1 }] })}>
        <Card style={styles.identity}>
          <Avatar name={name} size={56} />
          <View style={styles.flex}>
            <Text variant="title3">{name}</Text>
            <Text variant="caption" color="textSecondary">
              {summary}
            </Text>
          </View>
          <Icon name="chevron" size="sm" color="textMuted" />
        </Card>
      </Pressable>

      <ListGroup title={t('profile.groups.profile')}>
        {SETTINGS_SECTIONS.map((section) => (
          <ListRow
            key={section}
            icon={SECTION_ICON[section]}
            title={t(`settings.sections.${section}.title`)}
            value={sectionSummary(section, snapshot, t, year)}
            onPress={() => router.push(`/settings/${section}`)}
          />
        ))}
      </ListGroup>

      <ListGroup title={t('profile.groups.follow')}>
        <ListRow icon="weight" title={t('profile.measurements')} onPress={() => router.push('/measurements')} />
        <ListRow
          icon="bell"
          title={t('profile.reminders')}
          value={t(notificationsOn ? 'settings.summary.notificationsOn' : 'settings.summary.notificationsOff')}
          onPress={() => router.push('/notifications')}
        />
        <ListRow icon="coach" title={t('profile.memory')} onPress={() => router.push('/settings')} />
      </ListGroup>

      <ListGroup title={t('privacy.connections')}>
        <ListRow icon="devices" title={t('privacy.health')} onPress={() => router.push('/health')} />
        <ListRow icon="program" title={t('privacy.calendar')} onPress={() => router.push('/calendar')} />
      </ListGroup>

      <ListGroup title={t('profile.groups.data')}>
        <ListRow icon="lock" title={t('profile.privacy')} onPress={() => router.push('/privacy')} />
        <ListRow icon="settings" title={t('profile.allSettings')} onPress={() => router.push('/settings')} />
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xxs },
});
