import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Avatar, ListGroup, ListRow, Screen, Text } from '@/components/ui';
import { SETTINGS_SECTIONS, type SettingsSection } from '@/domain/settings/sections';
import { sectionSummary } from '@/features/settings/summaries';
import { useNotificationStore } from '@/state/notifications';
import { useProfileStore } from '@/state/profile';
import { spacing } from '@/theme';

const SECTION_ICON = {
  profile: 'profile',
  goal: 'progress',
  motivation: 'coach',
  training: 'workout',
  schedule: 'program',
  nutrition: 'nutrition',
} as const satisfies Record<SettingsSection, string>;

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

  return (
    <Screen airy>
      <View style={styles.header}>
        <Avatar name={name} size={64} />
        <View style={styles.flex}>
          <Text variant="title1">{name}</Text>
          <Text color="textSecondary">
            {t('profile.summary', {
              goal: t(`enums.goal.${snapshot.goal.type}`),
              count: snapshot.training.sessionsPerWeek,
            })}
          </Text>
        </View>
      </View>

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
          icon="time"
          title={t('profile.reminders')}
          value={t(notificationsOn ? 'settings.summary.notificationsOn' : 'settings.summary.notificationsOff')}
          onPress={() => router.push('/notifications')}
        />
        <ListRow icon="coach" title={t('profile.memory')} onPress={() => router.push('/settings')} />
      </ListGroup>

      <ListGroup title={t('profile.groups.data')}>
        <ListRow icon="safety" title={t('profile.privacy')} onPress={() => router.push('/privacy')} />
        <ListRow icon="settings" title={t('profile.allSettings')} onPress={() => router.push('/settings')} />
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  flex: { flex: 1, gap: spacing.xxs },
});
