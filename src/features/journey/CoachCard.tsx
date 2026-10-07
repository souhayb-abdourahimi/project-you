import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Badge, Button, HeroCard, HeroMedia, Text, type IconName } from '@/components/ui';
import type { Recommendation } from '@/domain/journey/adaptation';
import type { CoachDay } from '@/domain/journey/coach';
import type { DailyItem, DailyItemKind } from '@/domain/journey/daily-plan';
import { heroContent, type HeroChip } from '@/features/today/view';
import { spacing } from '@/theme';

import { CoachActionButton } from './CoachAction';
import { itemLabel } from './DailyItemRow';
import { ProposalCard } from './ProposalCard';
import { useSay } from './useSay';

const KIND_ICON: Record<DailyItemKind, IconName> = {
  workout: 'workout',
  activity: 'walk',
  recovery: 'mobility',
  meal: 'meal',
  checkin: 'checkin',
  weigh_in: 'weight',
  safety: 'safety',
};

/**
 * The coach of the day as the hero of Today (W-7 decisions, W-9 presentation): one main action, a
 * few facts that support it, at most one other option, and "Pourquoi ce choix ?". Everything comes
 * from `coachDay`; nothing is decided here.
 */
export function CoachCard({
  coach,
  items,
  proposal,
  today,
}: {
  coach: CoachDay;
  items: DailyItem[];
  proposal: Recommendation | null;
  today: string;
}) {
  const { t } = useTranslation();
  const say = useSay();
  const [why, setWhy] = useState(false);
  const primary = coach.primary;
  const item = primary?.kind === 'item' ? (items.find((i) => i.id === primary.itemId) ?? null) : null;

  if (primary?.kind === 'proposal' && proposal) {
    return (
      <View style={{ gap: spacing.sm }}>
        <ProposalCard recommendation={proposal} today={today} />
        <Facts coach={coach} />
      </View>
    );
  }

  const hero = item ? heroContent(item) : null;
  const dark = hero?.tone === 'inverse';
  // A session: its focus, big. Another item: its own line. A lighter day or a screen to open: the
  // rule that chose it (the button says what to do). Nothing left: the day is done.
  const title = item
    ? hero?.focus
      ? t(`enums.focus.${hero.focus}`)
      : itemLabel(item, t)
    : primary
      ? say(coach.explanation.rule)
      : t('daily.allDone');

  return (
    <HeroCard
      overline={t('daily.mainTitle')}
      icon={item ? KIND_ICON[item.kind] : primary ? 'coach' : 'done'}
      title={title}
      titleVariant={item ? 'title1' : 'title3'}
      tone={hero?.tone ?? (primary ? 'surface' : 'positive')}
      // No exercise media exists yet (media_url is empty): the drawn artwork stands in, never a stock photo.
      media={dark && item ? <HeroMedia icon={KIND_ICON[item.kind]} /> : undefined}
      meta={hero && hero.chips.length > 0 ? hero.chips.map((c) => <Chip key={c.kind} chip={c} dark={dark} />) : null}>
      {coach.calm ? <Text color={dark ? 'onInverseMuted' : 'textSecondary'}>{t('coachDay.calm')}</Text> : null}
      <Facts coach={coach} dark={dark} />
      {primary ? <CoachActionButton action={primary} items={items} today={today} block onDark={dark} /> : null}
      {coach.secondary ? (
        <CoachActionButton action={coach.secondary} items={items} today={today} secondary block onDark={dark} />
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button
          compact
          variant="ghost"
          onDark={dark}
          label={t(why ? 'coachDay.whyHide' : 'coachDay.why')}
          expanded={why}
          onPress={() => setWhy((w) => !w)}
        />
      </View>
      {why ? (
        <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
          <Text variant="caption" color={dark ? 'onInverse' : 'textPrimary'}>
            {say(coach.explanation.rule)}
          </Text>
          <Text variant="caption" color={dark ? 'onInverseMuted' : 'textMuted'}>
            {coach.explanation.facts.length > 0
              ? t('coachDay.basedOn', { facts: coach.explanation.facts.map(say).join(', ') })
              : t('coachDay.notEnoughData')}
          </Text>
        </View>
      ) : null}
    </HeroCard>
  );
}

function Chip({ chip, dark }: { chip: HeroChip; dark: boolean }) {
  const { t } = useTranslation();
  const tone = dark ? 'onDark' : 'neutral';
  switch (chip.kind) {
    case 'minutes':
      return <Badge tone={tone} icon="time" label={t('today.hero.minutes', { count: chip.minutes })} />;
    case 'variant':
      return <Badge tone={tone} label={t(`today.hero.variant.${chip.variant}`)} />;
    case 'location':
      return <Badge tone={tone} label={t(`enums.location.${chip.location}`)} />;
    case 'start':
      return <Badge tone={tone} label={t('daily.item.workoutAt', { time: chip.time })} />;
  }
}

function Facts({ coach, dark }: { coach: CoachDay; dark?: boolean }) {
  const say = useSay();
  if (coach.supportingFacts.length === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      {coach.supportingFacts.map((f) => (
        <Text key={f.key} color={dark ? 'onInverseMuted' : 'textSecondary'}>
          {say(f)}
        </Text>
      ))}
    </View>
  );
}
