import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, Row, Text } from '@/components/ui';
import { APPLICABLE_CHANGES, type Recommendation } from '@/domain/journey/adaptation';
import type { Adjustment } from '@/domain/journey/adjustments';
import { explainPlanChange } from '@/domain/journey/explain';
import type { IsoDate } from '@/domain/shared/dates';
import { formatDate } from '@/lib/format';
import { useDataStore } from '@/state/data';
import { spacing } from '@/theme';

type T = (key: string, params?: Record<string, unknown>) => string;

/** "−120 kcal par jour", "3 → 2 séances par semaine": the exact change, never a vague one. */
export function changeLabel(change: { key: string; from?: number | string | null; to?: number | string | null }, t: T) {
  if (change.key === 'calories_per_day') {
    const kcal = Number(change.to ?? 0) - Number(change.from ?? 0);
    return t('adaptation.change.calories_per_day', { kcal: kcal > 0 ? `+${kcal}` : String(kcal) });
  }
  if (change.key === 'session_day') return t('adaptation.change.session_day', { day: t(`enums.weekday.${change.to}`) });
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
 * and the data used. A proposal changes nothing until the user applies it; advice changes nothing.
 */
export function Recommendations({ recommendations, today }: { recommendations: Recommendation[]; today: IsoDate }) {
  const { t } = useTranslation();
  const adjustments = useDataStore((s) => s.adjustments);
  const saveAdjustment = useDataStore((s) => s.saveAdjustment);
  const decided = new Set(adjustments.filter((a) => a.status !== 'proposed').map((a) => a.id));
  const visible = recommendations.filter((r) => !decided.has(r.id));

  const decide = (r: Recommendation, status: 'applied' | 'declined') => {
    if (r.kind === 'none') return;
    saveAdjustment({
      id: r.id,
      kind: r.kind,
      changeKey: r.change.key,
      from: r.change.from ?? null,
      to: r.change.to ?? null,
      reasonKey: r.reason.key,
      evidence: r.evidence,
      status,
      effectiveFrom: today,
      decidedAt: new Date().toISOString(),
    });
  };

  return (
    <View style={{ gap: spacing.md }}>
      {visible.map((r) => (
        <Card key={r.id} muted={r.kind === 'none'}>
          {r.kind !== 'none' ? (
            <Text variant="caption" color="textMuted">
              {t(isApplicable(r) ? 'adaptation.proposal' : 'adaptation.advice')}
            </Text>
          ) : null}
          {r.kind !== 'none' ? <Text variant="heading">{changeLabel(r.change, t)}</Text> : null}
          <Text>{t(r.reason.key, r.reason.params)}</Text>
          <Evidence evidence={r.evidence} />
          {isApplicable(r) ? (
            <Row>
              <Button compact label={t('adaptation.apply')} onPress={() => decide(r, 'applied')} />
              <Button
                compact
                variant="secondary"
                label={t('adaptation.decline')}
                onPress={() => decide(r, 'declined')}
              />
            </Row>
          ) : null}
        </Card>
      ))}
      <PlanChange adjustments={adjustments} />
    </View>
  );
}

/** "Pourquoi mon plan a changé ?": the last applied decision, with a way back. */
function PlanChange({ adjustments }: { adjustments: Adjustment[] }) {
  const { t, i18n } = useTranslation();
  const saveAdjustment = useDataStore((s) => s.saveAdjustment);
  const why = explainPlanChange(adjustments);
  const latest = adjustments
    .filter((a) => a.status === 'applied' || a.status === 'reverted')
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
    .at(-1);
  if (!why || !latest) return null;
  const applied = latest.status === 'applied';
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
      {applied ? (
        <Button
          compact
          variant="ghost"
          label={t('adaptation.revert')}
          onPress={() => saveAdjustment({ ...latest, status: 'reverted', decidedAt: new Date().toISOString() })}
        />
      ) : null}
    </Card>
  );
}
