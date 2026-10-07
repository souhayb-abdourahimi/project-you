import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, type IconName } from '@/components/ui';
import type { DailyItem } from '@/domain/journey/daily-plan';
import { explainItem } from '@/domain/journey/explain';
import { useDataStore } from '@/state/data';
import { MIN_TOUCH, opacity, radius, spacing, useColors } from '@/theme';

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
              // The session this item is about, never the first one of the day by default (W-7.1).
              ...(p.sessionIndex !== undefined ? { index: String(p.sessionIndex) } : {}),
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
export function WhyToggle({ item, dark }: { item: DailyItem; dark?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const why = explainItem(item);
  return (
    <View style={{ gap: spacing.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.why, pressed && { opacity: opacity.subtle }]}>
        <Text variant="captionStrong" color={dark ? 'onInverse' : 'primary'}>
          {open ? t('daily.hideWhy') : t('daily.why')}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
          <Text variant="caption" color={dark ? 'onInverse' : 'textPrimary'}>
            {t(why.key, why.params)}
          </Text>
          {why.dataUsed.length > 0 ? (
            <Text variant="caption" color={dark ? 'onInverseMuted' : 'textMuted'}>
              {t('daily.basedOn', { data: why.dataUsed.map((d) => t(`reasons.${d}`)).join(', ') })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const ROW_ICON: Record<DailyItem['kind'], IconName> = {
  workout: 'workout',
  activity: 'walk',
  recovery: 'mobility',
  meal: 'meal',
  checkin: 'checkin',
  weigh_in: 'weight',
  safety: 'safety',
};

/** One line of "Ta journée": what it is, its planned facts, one action, and why it is there. */
export function DailyItemRow({ item, today }: { item: DailyItem; today: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const action = useItemAction(item, today);
  const done = item.status === 'done';
  return (
    <View style={styles.row} accessibilityLabel={`${itemLabel(item, t)}${done ? `, ${t('daily.done')}` : ''}`}>
      <View style={styles.header}>
        <View style={[styles.well, { backgroundColor: done ? colors.successSubtle : colors.surfaceSubtle }]}>
          <Icon name={done ? 'check' : ROW_ICON[item.kind]} size="sm" color={done ? 'success' : 'textSecondary'} />
        </View>
        <View style={styles.text}>
          <Text variant="bodyMedium" color={done ? 'textMuted' : 'textPrimary'}>
            {itemLabel(item, t)}
          </Text>
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
          <WhyToggle item={item} />
        </View>
        {action ? <Button compact variant="tertiary" label={action.label} onPress={action.run} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.md, gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  well: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  why: { minHeight: MIN_TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
});
