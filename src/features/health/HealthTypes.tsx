import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Chip, Text } from '@/components/ui';
import { HEALTH_DATA_TYPES, type HealthDataType, type HealthPermissions } from '@/domain/health/types';
import { spacing } from '@/theme';

/** One line per data type: what it is, why the coach needs it, and (once linked) its access state. */
export function HealthTypes({
  selected,
  onToggle,
  permissions,
}: {
  selected: HealthDataType[];
  onToggle: (type: HealthDataType) => void;
  permissions: HealthPermissions | null;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: spacing.md }}>
      {HEALTH_DATA_TYPES.map((type) => (
        <View key={type} style={{ gap: spacing.xs }}>
          <Chip label={t(`health.types.${type}`)} selected={selected.includes(type)} onPress={() => onToggle(type)} />
          <Text variant="caption" color="textMuted">
            {t(`health.why.${type}`)}
          </Text>
          {permissions && selected.includes(type) ? (
            <Text variant="caption" color={permissions[type] === 'denied' ? 'warning' : 'textMuted'}>
              {t(`health.permission.${permissions[type]}`)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
