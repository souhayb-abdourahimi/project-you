import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Card, ProgressBar, Text } from '@/components/ui';
import { summarizeWeek } from '@/domain/meals/budget';
import { NumberField } from '@/features/onboarding/fields';
import { usePlan } from '@/hooks/usePlan';
import { formatMoney } from '@/lib/format';
import { useDataStore } from '@/state/data';

export function BudgetCard() {
  const { t, i18n } = useTranslation();
  const plan = usePlan();
  const expenses = useDataStore((s) => s.expenses);
  const addExpense = useDataStore((s) => s.addExpense);
  const [amount, setAmount] = useState<number | undefined>();
  const [formKey, setFormKey] = useState(0);
  if (!plan) return null;
  const summary = summarizeWeek(plan.snapshot.budget.weeklyFoodBudgetCents, expenses, plan.weekStart);
  const money = (cents: number) => formatMoney(cents, i18n.language);

  return (
    <Card>
      <Text variant="title3">{t('nutrition.budget')}</Text>
      <Text variant="title2">
        {t('nutrition.budgetValue', { spent: money(summary.spentCents), planned: money(summary.plannedCents) })}
      </Text>
      <ProgressBar
        value={summary.ratio}
        label={t('nutrition.budget')}
        color={summary.status === 'on_track' ? 'success' : 'warning'}
      />
      <Text color="textMuted">{t('nutrition.budgetRemaining', { amount: money(summary.remainingCents) })}</Text>
      <NumberField key={formKey} label={t('nutrition.expenseAmount')} value={amount} onChange={setAmount} />
      <Button
        variant="secondary"
        label={t('nutrition.addExpense')}
        disabled={!amount || amount <= 0}
        onPress={() => {
          if (!amount) return;
          addExpense(Math.round(amount * 100), plan.today);
          setAmount(undefined);
          setFormKey((k) => k + 1);
        }}
      />
    </Card>
  );
}
