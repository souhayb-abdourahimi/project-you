import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { MIN_TOUCH, radius, spacing, typography, useColors } from '@/theme';

import { Text } from './Text';

export function TextField({
  label,
  error,
  hint,
  ...input
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          typography.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.borderStrong,
          },
        ]}
        {...input}
      />
      {hint && !error ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  input: { minHeight: 50, borderRadius: radius.input, borderWidth: 1, paddingHorizontal: spacing.lg },
});
