import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { Rationale as RationaleData } from '@/domain/shared/rationale';
import { MIN_TOUCH, spacing } from '@/theme';

import { Text } from './Text';

/** "Pourquoi cette recommandation ?" — shows the engine's structured explanation, never model reasoning. */
export function Rationale({ data }: { data: RationaleData }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tr = (key: string) => t(`reasons.${key}`, data.params ?? {});
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
        <Text variant="label" color="primary">
          {t('common.why')}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption">
            {t('rationale.goal')} : {tr(data.goal)}
          </Text>
          <Text variant="caption">
            {t('rationale.constraints')} :{' '}
            {data.constraints.length ? data.constraints.map(tr).join(', ') : t('rationale.none')}
          </Text>
          <Text variant="caption">
            {t('rationale.dataUsed')} : {data.dataUsed.map(tr).join(', ')}
          </Text>
          <Text variant="caption">
            {t('rationale.reason')} : {tr(data.reason)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
