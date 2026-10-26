import { useTranslation } from 'react-i18next';

import { Banner, Card, Text } from '@/components/ui';
import { assessGoalFeasibility, computeNutritionTargets } from '@/domain/nutrition/engine';
import { buildSnapshot, stepOfIssue, type OnboardingDraft } from '@/domain/onboarding/steps';
import { reasonsOf } from '@/domain/profile/schemas';
import { formatMonth } from '@/lib/format';

import { DietRecap } from './DietRecap';
import { reasonLabelKey } from './MotivationStep';

/** The plan the answers give, read before it is created (never auto-confirmed). */
export function ReviewStep({ draft }: { draft: OnboardingDraft }) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const result = buildSnapshot(draft, now);
  if (!result.ok) {
    // Named by the questions to reopen, not by field paths.
    const steps = [...new Set(result.issues.map(stepOfIssue))].map((id) => t(`onboarding.${id}.title`));
    return <Banner tone="danger" message={t('onboarding.review.invalid', { steps: steps.join(' · ') })} />;
  }
  const s = result.snapshot;
  const targets = computeNutritionTargets(s, now.getFullYear());
  const feasibility = assessGoalFeasibility(s, now.toISOString().slice(0, 10));
  const reasons = reasonsOf(s.motivation);
  return (
    <>
      <Card>
        <Text variant="caption" color="textMuted">
          {t('onboarding.review.calories')} ({t('common.estimate')})
        </Text>
        <Text variant="display">{t('common.kcal', { value: targets.calories })}</Text>
        <Text>{t('onboarding.review.macros', { p: targets.proteinG, c: targets.carbsG, f: targets.fatG })}</Text>
        <Text color="textMuted">
          {t('onboarding.review.sessions', { count: s.training.sessionsPerWeek, minutes: s.training.sessionMinutes })}
        </Text>
      </Card>
      <Card>
        <Text variant="heading" accessibilityRole="header">
          {t('onboarding.review.goalTitle')}
        </Text>
        <Text>{t(`enums.goal.${s.goal.type}`)}</Text>
        <Text color="textMuted">
          {reasons.length > 0
            ? t('onboarding.review.reasons', {
                reasons: reasons.map((r) => t(reasonLabelKey(r, s.goal.type))).join(', '),
              })
            : t('onboarding.review.noReasons')}
        </Text>
      </Card>
      <DietRecap nutrition={s.nutrition} />
      {targets.warnings
        .filter((w) => w !== 'sex_unspecified_estimate' || s.user.sex === 'unspecified')
        .map((w) => (
          <Banner key={w} message={t(`nutrition.warnings.${w}`)} />
        ))}
      {feasibility.status !== 'not_applicable' ? (
        <Banner
          tone={feasibility.status === 'ok' ? 'success' : 'warning'}
          message={t(`feasibility.${feasibility.status}`, {
            rate: Math.abs(feasibility.recommendedWeeklyChangeKg ?? 0),
            required: Math.abs(feasibility.requiredWeeklyChangeKg ?? 0),
            month: feasibility.suggestedTargetDate ? formatMonth(feasibility.suggestedTargetDate, i18n.language) : '',
          })}
        />
      ) : null}
      <Text variant="caption" color="textMuted">
        {t('onboarding.review.disclaimer')}
      </Text>
    </>
  );
}
