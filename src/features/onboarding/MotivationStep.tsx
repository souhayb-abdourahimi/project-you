import { useTranslation } from 'react-i18next';

import { ChoiceGroup, Text, TextField } from '@/components/ui';
import type { OnboardingDraft } from '@/domain/onboarding/steps';
import { MotivationReason, reasonsOf, type GoalType } from '@/domain/profile/schemas';

import { toggle } from './fields';
import type { Update } from './types';

/** "Weight" reads as the goal's direction: lose, gain or keep. */
export function weightReasonKey(goal: GoalType | undefined): 'weight_lose' | 'weight_gain' | 'weight_keep' {
  if (goal === 'fat_loss' || goal === 'weight_loss') return 'weight_lose';
  if (goal === 'muscle_gain') return 'weight_gain';
  return 'weight_keep';
}

/** Label of a reason for the user's current goal. */
export function reasonLabelKey(reason: MotivationReason, goal: GoalType | undefined): string {
  return `enums.motivationReason.${reason === 'weight' ? weightReasonKey(goal) : reason}`;
}

/**
 * Why the user starts: as many reasons as true (multi-select, D-046), plus their own words if they
 * want. The main goal stays one choice: the reasons change how the coach talks, never a target.
 */
export function MotivationStep({ draft, update, title }: { draft: OnboardingDraft; update: Update; title: string }) {
  const { t } = useTranslation();
  const selected = reasonsOf(draft.motivation);
  return (
    <>
      <Text color="textMuted">
        {draft.goal.type
          ? t('onboarding.motivation.reasons.hint', { goal: t(`enums.goal.${draft.goal.type}`).toLowerCase() })
          : t('onboarding.motivation.reasons.hintNoGoal')}
      </Text>
      <ChoiceGroup
        label={title}
        options={MotivationReason.options.map((r) => ({ value: r, label: t(reasonLabelKey(r, draft.goal.type)) }))}
        selected={selected}
        onToggle={(r) => update('motivation', { reasons: reasonsOf({ reasons: toggle(selected, r) }) })}
      />
      <TextField
        label={t('onboarding.motivation.reasons.own')}
        hint={t('onboarding.motivation.reasons.ownHint')}
        value={draft.motivation.why ?? ''}
        onChangeText={(why) => update('motivation', { why })}
        multiline
        maxLength={500}
      />
    </>
  );
}

/**
 * The older free-text questions (Réglages only): what the coach may quote (`change`, `feel`), and
 * the two others only when the user had answered them, so they can still be read and cleared.
 */
export function MotivationMore({ draft, update }: { draft: OnboardingDraft; update: Update }) {
  const { t } = useTranslation();
  const keys = (['change', 'feel', 'quitRisk', 'proudOf'] as const).filter(
    (key) => key === 'change' || key === 'feel' || !!draft.motivation[key]?.trim(),
  );
  return (
    <>
      <Text color="textMuted">{t('onboarding.motivation.more.hint')}</Text>
      {keys.map((key) => (
        <TextField
          key={key}
          label={t(`onboarding.motivation.more.${key}`)}
          value={draft.motivation[key] ?? ''}
          onChangeText={(value) => update('motivation', { [key]: value })}
          multiline
          maxLength={500}
        />
      ))}
    </>
  );
}
