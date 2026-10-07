import { useTranslation } from 'react-i18next';

import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { SessionStatus } from '@/domain/training/compare';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme';

/**
 * Where a session stands, as a fact (W-6): done, done in part, ended earlier, moved, replaced by a
 * lighter activity, or nothing recorded. Never "raté", never in red. Nothing for a session ahead.
 */
export function SessionStatusLine({
  status,
  movedTo,
  replacedBy,
}: {
  status: SessionStatus;
  movedTo: string | null;
  replacedBy: string | null;
}) {
  const { t, i18n } = useTranslation();
  if (status === 'planned') return null;
  const done = status === 'completed' || status === 'partial' || status === 'stopped';
  const text =
    status === 'moved' && movedTo
      ? t('program.status.moved', { date: formatDate(movedTo, i18n.language) })
      : status === 'replaced'
        ? t('program.status.replaced', { activity: t(`program.activity.${replacedBy ?? 'other_sport'}`) })
        : t(`program.status.${status}`);
  return (
    <View style={styles.row}>
      <Icon
        name={done ? 'done' : status === 'moved' ? 'arrow' : 'info'}
        size="sm"
        color={done ? 'success' : 'textMuted'}
      />
      <Text color={done ? 'success' : 'textMuted'} style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1 },
});
