import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import type { Recommendation } from '@/domain/journey/adaptation';
import type { CoachDay } from '@/domain/journey/coach';
import type { DailyItem } from '@/domain/journey/daily-plan';
import { spacing } from '@/theme';

import { CoachActionButton } from './CoachAction';
import { itemLabel, WhyToggle } from './DailyItemRow';
import { ProposalCard } from './ProposalCard';
import { useSay } from './useSay';

/**
 * The coach of the day (W-7): one main action, a few facts that support it, at most one other
 * option, and "Pourquoi ce choix ?". Everything comes from `coachDay`; nothing is decided here.
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
  return (
    <Card>
      <Text variant="caption" color="textMuted">
        {t('daily.mainTitle')}
      </Text>
      {coach.calm ? <Text color="textMuted">{t('coachDay.calm')}</Text> : null}
      {item ? (
        <Text variant="title" accessibilityRole="header">
          {itemLabel(item, t)}
        </Text>
      ) : primary ? null : (
        <Text variant="title">{t('daily.allDone')}</Text>
      )}
      {primary ? <CoachActionButton action={primary} items={items} today={today} /> : null}
      {item ? <WhyToggle item={item} /> : null}
      <Facts coach={coach} />
      {coach.secondary ? <CoachActionButton action={coach.secondary} items={items} today={today} secondary /> : null}
      <Button
        compact
        variant="ghost"
        label={t(why ? 'coachDay.whyHide' : 'coachDay.why')}
        expanded={why}
        onPress={() => setWhy((w) => !w)}
      />
      {why ? (
        <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
          <Text variant="caption">{say(coach.explanation.rule)}</Text>
          <Text variant="caption" color="textMuted">
            {coach.explanation.facts.length > 0
              ? t('coachDay.basedOn', { facts: coach.explanation.facts.map(say).join(', ') })
              : t('coachDay.notEnoughData')}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

function Facts({ coach }: { coach: CoachDay }) {
  const say = useSay();
  if (coach.supportingFacts.length === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      {coach.supportingFacts.map((f) => (
        <Text key={f.key} variant="caption" color="textMuted">
          {say(f)}
        </Text>
      ))}
    </View>
  );
}
