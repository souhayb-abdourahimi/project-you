import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChoiceGroup, Text } from '@/components/ui';
import { monthlyFromWeekly } from '@/domain/meals/budget';
import {
  BUDGET_PRESETS_CENTS,
  TARGET_HORIZONS,
  WEIGHT_RANGE,
  targetDateIn,
  type OnboardingDraft,
} from '@/domain/onboarding/steps';
import { toIsoDate } from '@/domain/shared/dates';
import { formatMoney, formatMonth } from '@/lib/format';

import { MassField, NumberField } from './fields';
import type { Update } from './types';

/** Target weight and a deadline chosen in one touch (3, 6, 12 months or none), never typed. */
export function TargetStep({ draft, update }: { draft: OnboardingDraft; update: Update }) {
  const { t, i18n } = useTranslation();
  const today = toIsoDate(new Date());
  const target = draft.goal.targetWeightKg;
  const outOfRange = target !== undefined && (target < WEIGHT_RANGE.min || target > WEIGHT_RANGE.max);
  const presets = TARGET_HORIZONS.map((months) => ({ months, date: targetDateIn(months, today) }));
  const current = draft.goal.targetDate;
  const selected =
    current === undefined ? ['none'] : presets.filter((p) => p.date === current).map((p) => String(p.months));
  return (
    <>
      <Text color="textMuted">{t('onboarding.goal.target.hint')}</Text>
      <MassField
        label={(unit) => t('onboarding.goal.target.weight', { unit })}
        valueKg={target}
        onChange={(targetWeightKg) => update('goal', { targetWeightKg })}
        error={outOfRange ? t('onboarding.goal.target.outOfRange') : undefined}
        deferError
      />
      <Text variant="label">{t('onboarding.goal.target.date')}</Text>
      <ChoiceGroup
        single
        label={t('onboarding.goal.target.date')}
        options={[
          ...presets.map((p) => ({
            value: String(p.months),
            label: t('onboarding.goal.target.inMonths', { count: p.months }),
          })),
          { value: 'none', label: t('onboarding.goal.target.noDate') },
        ]}
        selected={selected}
        onToggle={(v) =>
          update('goal', { targetDate: v === 'none' ? undefined : presets.find((p) => String(p.months) === v)?.date })
        }
      />
      {current ? (
        <Text color="textMuted">
          {t('onboarding.goal.target.deadline', { month: formatMonth(current, i18n.language) })}
        </Text>
      ) : null}
    </>
  );
}

/** Weekly food budget: a usual amount in one touch, any amount typed, or no precise budget. */
export function BudgetStep({ draft, update }: { draft: OnboardingDraft; update: Update }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const cents = draft.budget.weeklyFoodBudgetCents;
  // A preset rewrites the typed field; typing never remounts it (the keyboard stays open).
  const [preset, setPreset] = useState(0);
  return (
    <>
      <Text color="textMuted">{t('onboarding.budget.food.hint')}</Text>
      <ChoiceGroup
        single
        label={t('onboarding.budget.food.title')}
        options={BUDGET_PRESETS_CENTS.map((value) => ({
          value,
          label: value === 0 ? t('onboarding.budget.food.none') : formatMoney(value, lang, 'EUR', true),
        }))}
        selected={cents === undefined ? [] : [cents]}
        onToggle={(weeklyFoodBudgetCents) => {
          update('budget', { weeklyFoodBudgetCents });
          setPreset((n) => n + 1);
        }}
      />
      <NumberField
        key={preset}
        label={t('onboarding.budget.food.label')}
        value={cents === undefined || cents === 0 ? undefined : cents / 100}
        onChange={(euros) =>
          update('budget', {
            weeklyFoodBudgetCents:
              euros === undefined ? undefined : Math.min(100_000, Math.max(0, Math.round(euros * 100))),
          })
        }
      />
      {cents === 0 ? (
        <Text color="textMuted">{t('onboarding.budget.food.noneHint')}</Text>
      ) : cents !== undefined ? (
        <Text color="textMuted">
          {t('onboarding.budget.food.monthly', { amount: formatMoney(monthlyFromWeekly(cents), lang) })}
        </Text>
      ) : null}
    </>
  );
}
