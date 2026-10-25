import { useTranslation } from 'react-i18next';

import { RadioList, Text } from '@/components/ui';
import type { OnboardingDraft, OnboardingStepId } from '@/domain/onboarding/steps';
import { ActivityLevel, Diet, GoalType, Sex, TrainingLevel } from '@/domain/profile/schemas';

import type { Update } from './types';

/** The one-answer questions, as radio rows with a short explanation each (W-11). */
export type ChoiceStepId =
  'profile.sex' | 'profile.activity' | 'goal.type' | 'diet.type' | 'training.gym' | 'training.level';

export const CHOICE_STEPS: readonly ChoiceStepId[] = [
  'profile.sex',
  'profile.activity',
  'goal.type',
  'diet.type',
  'training.gym',
  'training.level',
];

export function isChoiceStep(step: OnboardingStepId): step is ChoiceStepId {
  return (CHOICE_STEPS as readonly string[]).includes(step);
}

export function ChoiceStep({
  step,
  draft,
  update,
  title,
  onAnswered,
}: {
  step: ChoiceStepId;
  draft: OnboardingDraft;
  update: Update;
  title: string;
  /** Called after an answer is touched (the questionnaire may then move on). */
  onAnswered?: () => void;
}) {
  const { t } = useTranslation();
  const answered =
    <T,>(apply: (value: T) => void) =>
    (value: T) => {
      apply(value);
      onAnswered?.();
    };
  const described = <T extends string>(values: readonly T[], label: string, hint?: string) =>
    values.map((v) => ({
      value: v,
      label: t(`${label}.${v}`),
      ...(hint ? { description: t(`${hint}.${v}`) } : {}),
    }));

  switch (step) {
    case 'profile.sex':
      return (
        <>
          <Text color="textMuted">{t('onboarding.profile.sex.hint')}</Text>
          <RadioList
            label={title}
            options={described(Sex.options, 'enums.sex')}
            value={draft.user.sex ?? null}
            onChange={answered((sex) => update('user', { sex }))}
          />
        </>
      );
    case 'profile.activity':
      return (
        <RadioList
          label={title}
          options={described(ActivityLevel.options, 'enums.activity', 'enums.activityHint')}
          value={draft.user.activityLevel ?? null}
          onChange={answered((activityLevel) => update('user', { activityLevel }))}
        />
      );
    case 'goal.type':
      return (
        <>
          <Text color="textMuted">{t('onboarding.goal.type.hint')}</Text>
          <RadioList
            label={title}
            options={described(GoalType.options, 'enums.goal', 'enums.goalHint')}
            value={draft.goal.type ?? null}
            onChange={answered((type) => update('goal', { type }))}
          />
        </>
      );
    case 'diet.type':
      return (
        <>
          <RadioList
            label={title}
            options={described(Diet.options, 'enums.diet', 'enums.dietHint')}
            value={draft.nutrition.diet ?? null}
            onChange={answered((diet) => update('nutrition', { diet }))}
          />
          <Text variant="caption" color="textMuted">
            {t('onboarding.diet.type.hint')}
          </Text>
        </>
      );
    case 'training.gym':
      return (
        <RadioList
          label={title}
          options={[
            { value: 'yes' as const, label: t('onboarding.training.gym.yes') },
            {
              value: 'no' as const,
              label: t('onboarding.training.gym.no'),
              description: t('onboarding.training.gym.noHint'),
            },
          ]}
          value={draft.training.hasGym === undefined ? null : draft.training.hasGym ? 'yes' : 'no'}
          onChange={answered((v) => update('training', { hasGym: v === 'yes' }))}
        />
      );
    case 'training.level':
      return (
        <RadioList
          label={title}
          options={described(TrainingLevel.options, 'enums.level', 'enums.levelHint')}
          value={draft.training.level ?? null}
          onChange={answered((level) => update('training', { level }))}
        />
      );
  }
}
