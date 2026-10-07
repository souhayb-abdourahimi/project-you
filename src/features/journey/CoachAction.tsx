import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';
import type { CoachAction, CoachRoute } from '@/domain/journey/coach';
import type { DailyItem } from '@/domain/journey/daily-plan';
import { useDataStore } from '@/state/data';

import { useItemAction } from './DailyItemRow';
import { useSay } from './useSay';

const ROUTES: Record<CoachRoute, Parameters<typeof router.push>[0]> = {
  adapt: '/adapt',
  adapt_time: { pathname: '/adapt', params: { mode: 'time' } },
  adapt_motivation: { pathname: '/adapt', params: { mode: 'motivation' } },
  program: '/program',
  shopping: '/shopping',
  nutrition: '/nutrition',
};

const NONE: DailyItem = { id: 'none', kind: 'safety', status: 'done', params: {}, reason: 'safety' };

/** One coach action as a button: an item of the day, a lighter day in one tap, or a screen. */
export function CoachActionButton({
  action,
  items,
  today,
  secondary,
}: {
  action: CoachAction;
  items: DailyItem[];
  today: string;
  secondary?: boolean;
}) {
  const { t } = useTranslation();
  const say = useSay();
  const logDay = useDataStore((s) => s.logDay);
  const item = action.kind === 'item' ? (items.find((i) => i.id === action.itemId) ?? null) : null;
  const itemAction = useItemAction(item ?? NONE, today);
  const variant = secondary ? 'secondary' : 'primary';
  if (action.kind === 'proposal') return null;
  if (action.kind === 'item') {
    return itemAction ? <Button variant={variant} label={itemAction.label} onPress={itemAction.run} /> : null;
  }
  if (action.kind === 'day_mode') {
    return <Button variant={variant} label={say(action.label)} onPress={() => logDay(today, { mode: action.mode })} />;
  }
  return (
    <Button
      variant={variant}
      label={say(action.label)}
      accessibilityHint={t('coachDay.opensScreen')}
      onPress={() => router.push(ROUTES[action.route])}
    />
  );
}
