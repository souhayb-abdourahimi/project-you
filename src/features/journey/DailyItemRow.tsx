import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import type { DailyItem } from '@/domain/journey/daily-plan';
import { explainItem } from '@/domain/journey/explain';
import { useDataStore } from '@/state/data';
import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

type T = (key: string, params?: Record<string, unknown>) => string;

/** The line shown for an item of the day: only planned or entered values, estimates labelled. */
export function itemLabel(item: DailyItem, t: T): string {
  const p = item.params;
  switch (item.kind) {
    case 'safety':
      return t('daily.item.safety');
    case 'workout': {
      if (item.status === 'done') return t('daily.item.workout_done');
      const focus = t(`enums.focus.${p.focus}`);
      const key = p.variant === 'short' ? 'workout_short' : p.variant === 'light' ? 'workout_light' : 'workout';
      return t(`daily.item.${key}`, { focus, minutes: p.minutes });
    }
    case 'activity':
      return item.status === 'done'
        ? t(`daily.item.activity_done_${p.activity}`)
        : t(`daily.item.activity_${p.activity}`, { minutes: p.minutes });
    case 'recovery':
      if (p.type === 'mobility') return t('daily.item.recovery_mobility', { minutes: p.minutes });
      return p.walkMinutes ? t('daily.item.recovery_rest_walk', p) : t('daily.item.recovery_rest');
    case 'meal':
      return t('daily.item.meal', { ...p, estimate: t('daily.estimate') });
    case 'checkin':
      return t(`daily.item.checkin_${p.type}`);
    case 'weigh_in':
      return t('daily.item.weigh_in');
  }
}

/** Where an item leads, or what one tap records (a walk or a rest taken is simply noted). */
export function useItemAction(item: DailyItem, today: string): { label: string; run: () => void } | null {
  const { t } = useTranslation();
  const logDay = useDataStore((s) => s.logDay);
  if (item.status === 'done' || item.kind === 'safety') return null;
  const p = item.params;
  switch (item.kind) {
    case 'workout':
      return {
        label: t('daily.start'),
        run: () =>
          router.push({
            pathname: '/workout/[date]',
            // The duration announced here is the one the session is built for (D-034).
            params: {
              date: today,
              ...(p.variant !== 'full' ? { variant: String(p.variant), minutes: String(p.minutes) } : {}),
            },
          }),
      };
    case 'activity':
    case 'recovery': {
      const activity = item.kind === 'activity' ? p.activity : p.type;
      if (activity !== 'walk' && activity !== 'mobility' && activity !== 'rest') return null;
      const minutes = Number(p.minutes ?? p.walkMinutes) || undefined;
      return {
        label: t('daily.done'),
        run: () => logDay(today, { activity, ...(minutes && activity !== 'rest' ? { activityMinutes: minutes } : {}) }),
      };
    }
    case 'meal':
      return { label: t('daily.open'), run: () => router.push('/nutrition') };
    case 'checkin':
      return { label: t('daily.open'), run: () => router.push(p.type === 'weekly' ? '/checkin' : '/nutrition') };
    case 'weigh_in':
      return { label: t('daily.open'), run: () => router.push('/progress') };
  }
}

/** "Pourquoi ?": the structured explanation and the data it relies on. */
export function WhyToggle({ item }: { item: DailyItem }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const why = explainItem(item);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={styles.why}>
        <Text variant="label" color="primary">
          {open ? t('daily.hideWhy') : t('daily.why')}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption">{t(why.key, why.params)}</Text>
          {why.dataUsed.length > 0 ? (
            <Text variant="caption" color="textMuted">
              {t('daily.basedOn', { data: why.dataUsed.map((d) => t(`reasons.${d}`)).join(', ') })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function DailyItemRow({ item, today }: { item: DailyItem; today: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const action = useItemAction(item, today);
  const done = item.status === 'done';
  return (
    <View
      style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}
      accessibilityLabel={`${itemLabel(item, t)}${done ? `, ${t('daily.done')}` : ''}`}>
      <View style={styles.header}>
        <Text accessibilityElementsHidden importantForAccessibility="no" color={done ? 'success' : 'textMuted'}>
          {done ? '✓' : '○'}
        </Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text color={done ? 'textMuted' : 'text'}>{itemLabel(item, t)}</Text>
          {item.kind === 'workout' && !done && item.params.start ? (
            <Text variant="caption" color="textMuted">
              {t('daily.item.workoutAt', { time: item.params.start })}
            </Text>
          ) : null}
          {item.kind === 'workout' && !done && item.params.goal ? (
            <Text variant="caption" color="textMuted">
              {t(`daily.item.goal_${item.params.goal}`)}
            </Text>
          ) : null}
          {item.kind === 'meal' && item.params.nextSlot ? (
            <Text variant="caption" color="textMuted">
              {t('daily.item.meal_next', { slot: t(`enums.slot.${item.params.nextSlot}`) })}
            </Text>
          ) : null}
        </View>
        {action ? <Button compact variant="secondary" label={action.label} onPress={action.run} /> : null}
      </View>
      <WhyToggle item={item} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  why: { minHeight: MIN_TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
});
