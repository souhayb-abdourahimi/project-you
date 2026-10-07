import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components/ui';
import { spacing } from '@/theme';
import { formatDate } from '@/lib/format';

import type { ProgramWeekView } from './useProgramWeek';

/** The version in force and why it exists (`program.reason.*`), with the way to the history. */
export function ProgramVersionCard({ version }: { version: ProgramWeekView['version'] }) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      {version ? (
        <View style={styles.row}>
          <Icon name="program" size="md" color="primary" />
          <View style={styles.text}>
            <Text variant="captionStrong" color="textSecondary">
              {t('program.version', {
                version: version.version,
                date: formatDate(String(version.params.from), i18n.language),
              })}
            </Text>
            <Text>{t(version.key)}</Text>
          </View>
        </View>
      ) : null}
      <Button
        compact
        variant="tertiary"
        icon="history"
        label={t('history.open')}
        onPress={() => router.push('/history')}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  text: { flex: 1, gap: spacing.xxs },
});
