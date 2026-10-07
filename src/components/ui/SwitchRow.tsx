import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { MIN_TOUCH, spacing, useColors } from '@/theme';

import { Text } from './Text';

/**
 * A named on/off setting: the whole row is the touch target, announced as a switch with its state
 * and its description (VoiceOver / TalkBack, aria-checked on the web).
 */
export function SwitchRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      role="switch"
      aria-checked={value}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={label}
      accessibilityHint={description}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={styles.row}>
      <View style={styles.text}>
        <Text>{label}</Text>
        {description ? (
          <Text variant="caption" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
      {/* Decorative: the row carries the role and the state for screen readers. */}
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onChange}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.surface}
          tabIndex={-1}
          aria-hidden
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: spacing.xs },
});
