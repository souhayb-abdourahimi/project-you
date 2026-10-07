import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { spacing } from '@/theme';

import { Button, type ButtonProps } from './Button';
import { Text } from './Text';

/**
 * Two-step button for destructive actions: the first press shows what will happen and asks to
 * confirm. Works the same on web and native (no Alert dependency).
 */
export function ConfirmButton({
  label,
  message,
  confirmLabel,
  onConfirm,
  loading,
  variant = 'danger',
  accessibilityLabel,
}: Pick<ButtonProps, 'label' | 'loading' | 'variant' | 'accessibilityLabel'> & {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button
        variant={variant}
        label={label}
        accessibilityLabel={accessibilityLabel}
        loading={loading}
        onPress={() => setAsking(true)}
      />
    );
  return (
    <View style={{ gap: spacing.sm }} accessibilityLiveRegion="polite">
      <Text color="danger">{message}</Text>
      <Button
        variant="danger"
        label={confirmLabel ?? t('common.confirm')}
        loading={loading}
        onPress={() => {
          setAsking(false);
          onConfirm();
        }}
      />
      <Button variant="ghost" label={t('common.cancel')} onPress={() => setAsking(false)} />
    </View>
  );
}
