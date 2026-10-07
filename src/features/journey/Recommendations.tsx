import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { APPLICABLE_CHANGES, undecided, type Recommendation } from '@/domain/journey/adaptation';
import { byInstant, effectiveDecisions, type Adjustment } from '@/domain/journey/adjustments';
import { explainPlanChange } from '@/domain/journey/explain';
import type { AdaptationEffect } from '@/domain/journey/structural';
import type { IsoDate } from '@/domain/shared/dates';
import { formatDate } from '@/lib/format';
import { useDataStore } from '@/state/data';
import { spacing } from '@/theme';

import { ProposalCard } from './ProposalCard';
import { useDecision } from './useDecision';

type T = (key: string, params?: Record<string, unknown>) => string;

/** "−120 kcal par jour", "3 → 2 séances par semaine": the exact change, never a vague one. */
export function changeLabel(change: { key: string; from?: number | string | null; to?: number | string | null }, t: T) {
  if (change.key === 'calories_per_day') {
    const kcal = Number(change.to ?? 0) - Number(change.from ?? 0);
    return t('adaptation.change.calories_per_day', { kcal: kcal > 0 ? `+${kcal}` : String(kcal) });
  }
  if (change.key === 'session_day') return t('adaptation.change.session_day', { day: t(`enums.weekday.${change.to}`) });
  if (['restart', 'reduce_volume', 'easier_variant', 'exercise_change', 'cycle_review'].includes(change.key))
    return t(`adaptation.changed.${change.key}`);
  return t(`adaptation.change.${change.key}`, { from: change.from, to: change.to });
}

function Evidence({ evidence }: { evidence: Record<string, string | number> }) {
  const { t } = useTranslation();
  const entries = Object.entries(evidence);
  if (entries.length === 0) return null;
  return (
    <Text variant="caption" color="textMuted">
      {t('adaptation.basedOn', {
        data: entries
          .map(([k, v]) => t(`adaptation.evidence.${k}`, { value: k === 'flag' ? t(`adaptation.flag.${v}`) : v }))
          .join(' · '),
      })}
    </Text>
  );
}

const isApplicable = (r: Recommendation) =>
  r.mode === 'proposed' && r.kind !== 'none' && (APPLICABLE_CHANGES as readonly string[]).includes(r.change.key);

/**
 * What the Adaptation Engine says this week (docs/ADAPTATION_ENGINE.md §2): the change, the reason
 * and the data used. A proposal changes nothing until the user applies it (D-036); advice changes
 * nothing. Every answer is a new row of the journal (W-5): apply, not now, refuse, go back.
 */
export function Recommendations({
  recommendations,
  today,
  effects = [],
}: {
  recommendations: Recommendation[];
  today: IsoDate;
  effects?: AdaptationEffect[];
}) {
  const { t } = useTranslation();
  const adjustments = useDataStore((s) => s.adjustments);
  const visible = undecided(recommendations, adjustments);

  return (
    <View style={{ gap: spacing.md }}>
      {visible.map((r) =>
        isApplicable(r) ? (
          <ProposalCard key={r.id} recommendation={r} today={today} />
        ) : (
          <Card key={r.id} muted={r.kind === 'none'}>
            {r.kind !== 'none' ? (
              <Text variant="caption" color="textMuted">
                {t('adaptation.advice')}
              </Text>
            ) : null}
            {r.kind !== 'none' ? <Text variant="heading">{changeLabel(r.change, t)}</Text> : null}
            <Text>{t(r.reason.key, r.reason.params)}</Text>
            <Evidence evidence={r.evidence} />
          </Card>
        ),
      )}
      <PlanChange adjustments={adjustments} today={today} effects={effects} />
    </View>
  );
}

/**
 * "Pourquoi mon plan a changé ?": the decision in force last taken, with a way back (a new
 * decision, D-037 §21) and, for a structural change, what was observed since (facts, no cause).
 */
function PlanChange({
  adjustments,
  today,
  effects,
}: {
  adjustments: Adjustment[];
  today: IsoDate;
  effects: AdaptationEffect[];
}) {
  const { t, i18n } = useTranslation();
  const { revert } = useDecision(today);
  const why = explainPlanChange([...effectiveDecisions(adjustments).values()]);
  const latest = [...effectiveDecisions(adjustments).values()]
    .filter((a) => a.status === 'applied' || a.status === 'reverted')
    .sort(byInstant)
    .at(-1);
  if (!why || !latest) return null;
  const applied = latest.status === 'applied';
  const effect = effects.find((e) => e.decisionId === latest.id);
  return (
    <Card muted>
      <Text variant="label">{t('adaptation.lastChange')}</Text>
      <Text>
        {t(applied ? 'adaptation.appliedOn' : 'adaptation.revertedOn', {
          change: changeLabel({ key: latest.changeKey, from: latest.from, to: latest.to }, t),
          date: formatDate(latest.effectiveFrom, i18n.language),
        })}
      </Text>
      <Text variant="caption">{t(why.key, why.params)}</Text>
      {why.dataUsed.length > 0 ? (
        <Text variant="caption" color="textMuted">
          {t('daily.basedOn', { data: why.dataUsed.map((d) => t(`reasons.${d}`)).join(', ') })}
        </Text>
      ) : null}
      {applied && effect
        ? effect.observations.map((o) => (
            <Text key={o} variant="caption">
              {t(`adaptation.effect.${o}`, { days: effect.period.days })}
            </Text>
          ))
        : null}
      {applied ? (
        <Button compact variant="ghost" label={t('adaptation.revert')} onPress={() => revert(latest)} />
      ) : null}
    </Card>
  );
}
