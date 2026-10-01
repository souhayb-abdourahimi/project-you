import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Banner, Card, ChoiceGroup, Text, TextField } from '@/components/ui';
import { buildSnapshot, type OnboardingDraft, type OnboardingStepId } from '@/domain/onboarding/steps';
import { monthlyFromWeekly } from '@/domain/meals/budget';
import { assessGoalFeasibility, computeNutritionTargets } from '@/domain/nutrition/engine';
import {
  ActivityLevel,
  Allergen,
  Diet,
  Equipment,
  GoalType,
  KitchenEquipment,
  LifeStatus,
  MIN_AGE,
  Sex,
  TrainingLevel,
} from '@/domain/profile/schemas';
import { EXERCISES } from '@/domain/training/exercises';
import { ExclusionSummary } from '@/features/nutrition/ExclusionSummary';
import { formatMoney, formatMonth } from '@/lib/format';
import { spacing } from '@/theme';

import { DietRecap } from './DietRecap';
import { ListField, NumberField, toggle } from './fields';
import { ScheduleEditor } from './ScheduleEditor';

type Update = <K extends keyof OnboardingDraft>(section: K, patch: Partial<OnboardingDraft[K]>) => void;

const PRIORITIES = ['aesthetics', 'strength', 'health', 'performance'] as const;
const MEALS = [2, 3, 4, 5];
const COOKING = [5, 15, 30, 45, 60];
const SESSIONS = [1, 2, 3, 4, 5, 6];
const DURATIONS = [20, 30, 45, 60, 75, 90];

export function StepContent({
  step,
  draft,
  update,
}: {
  step: OnboardingStepId;
  draft: OnboardingDraft;
  update: Update;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const title = t(`onboarding.${step}.title`);
  const year = new Date().getFullYear();
  const single = <T extends string | number>(value: T | undefined) => (value === undefined ? [] : [value]);

  const body = (() => {
    switch (step) {
      case 'profile.name':
        return (
          <TextField
            label={t('onboarding.profile.name.label')}
            value={draft.user.displayName ?? ''}
            onChangeText={(displayName) => update('user', { displayName })}
            autoComplete="nickname"
            maxLength={40}
          />
        );
      case 'profile.age': {
        const age = draft.user.birthYear !== undefined ? year - draft.user.birthYear : undefined;
        return (
          <NumberField
            label={t('onboarding.profile.age.label')}
            hint={t('onboarding.profile.age.hint')}
            value={draft.user.birthYear}
            onChange={(birthYear) => update('user', { birthYear })}
            error={age !== undefined && age < MIN_AGE ? t('onboarding.profile.age.tooYoung') : undefined}
          />
        );
      }
      case 'profile.body':
        return (
          <>
            <NumberField
              label={t('onboarding.profile.body.height')}
              value={draft.user.heightCm}
              onChange={(heightCm) => update('user', { heightCm })}
            />
            <NumberField
              label={t('onboarding.profile.body.weight')}
              value={draft.user.weightKg}
              onChange={(weightKg) => update('user', { weightKg })}
            />
          </>
        );
      case 'profile.sex':
        return (
          <>
            <Text color="textMuted">{t('onboarding.profile.sex.hint')}</Text>
            <ChoiceGroup
              options={Sex.options.map((v) => ({ value: v, label: t(`enums.sex.${v}`) }))}
              selected={single(draft.user.sex)}
              onToggle={(sex) => update('user', { sex })}
            />
          </>
        );
      case 'profile.activity':
        return (
          <ChoiceGroup
            options={ActivityLevel.options.map((v) => ({ value: v, label: t(`enums.activity.${v}`) }))}
            selected={single(draft.user.activityLevel)}
            onToggle={(activityLevel) => update('user', { activityLevel })}
          />
        );
      case 'goal.type':
        return (
          <ChoiceGroup
            options={GoalType.options.map((v) => ({ value: v, label: t(`enums.goal.${v}`) }))}
            selected={single(draft.goal.type)}
            onToggle={(type) => update('goal', { type })}
          />
        );
      case 'goal.target':
        return (
          <>
            <Text color="textMuted">{t('onboarding.goal.target.hint')}</Text>
            <NumberField
              label={t('onboarding.goal.target.weight')}
              value={draft.goal.targetWeightKg}
              onChange={(targetWeightKg) => update('goal', { targetWeightKg })}
            />
            <TextField
              label={t('onboarding.goal.target.date')}
              value={draft.goal.targetDate ?? ''}
              placeholder="2027-06-30"
              onChangeText={(v) => update('goal', { targetDate: /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined })}
            />
          </>
        );
      case 'goal.priorities': {
        const priorities = draft.goal.priorities ?? { aesthetics: 1, strength: 1, health: 1, performance: 1 };
        return (
          <>
            <Text color="textMuted">{t('onboarding.goal.priorities.hint')}</Text>
            {PRIORITIES.map((key) => (
              <View key={key} style={{ gap: spacing.xs }}>
                <Text variant="label">{t(`enums.priority.${key}`)}</Text>
                <ChoiceGroup
                  options={[0, 1, 2, 3].map((v) => ({ value: v, label: String(v) }))}
                  selected={[priorities[key]]}
                  onToggle={(v) => update('goal', { priorities: { ...priorities, [key]: v } })}
                />
              </View>
            ))}
          </>
        );
      }
      case 'motivation.why':
        return (
          <TextField
            label={title}
            hint={t('onboarding.motivation.why.hint')}
            value={draft.motivation.why ?? ''}
            onChangeText={(why) => update('motivation', { why })}
            multiline
            maxLength={500}
          />
        );
      case 'motivation.more':
        return (
          <>
            {(['change', 'feel', 'quitRisk', 'proudOf'] as const).map((key) => (
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
      case 'life.status':
        return (
          <ChoiceGroup
            options={LifeStatus.options.map((v) => ({ value: v, label: t(`enums.life.${v}`) }))}
            selected={single(draft.lifestyle.lifeStatus)}
            onToggle={(lifeStatus) => update('lifestyle', { lifeStatus })}
          />
        );
      case 'budget.food': {
        const cents = draft.budget.weeklyFoodBudgetCents;
        return (
          <>
            <NumberField
              label={t('onboarding.budget.food.label')}
              value={cents === undefined ? undefined : cents / 100}
              onChange={(euros) =>
                update('budget', { weeklyFoodBudgetCents: euros === undefined ? undefined : Math.round(euros * 100) })
              }
            />
            {cents !== undefined ? (
              <Text color="textMuted">
                {t('onboarding.budget.food.monthly', { amount: formatMoney(monthlyFromWeekly(cents), lang) })}
              </Text>
            ) : null}
          </>
        );
      }
      case 'kitchen.equipment':
        return (
          <ChoiceGroup
            options={KitchenEquipment.options.map((v) => ({ value: v, label: t(`enums.kitchen.${v}`) }))}
            selected={draft.lifestyle.kitchen ?? []}
            onToggle={(v) => update('lifestyle', { kitchen: toggle(draft.lifestyle.kitchen, v) })}
          />
        );
      case 'diet.type':
        return (
          <ChoiceGroup
            options={Diet.options.map((v) => ({ value: v, label: t(`enums.diet.${v}`) }))}
            selected={single(draft.nutrition.diet)}
            onToggle={(diet) => update('nutrition', { diet })}
          />
        );
      case 'diet.allergies': {
        // Adaptive: vegans are not asked about animal allergens they already avoid.
        const hidden: Allergen[] =
          draft.nutrition.diet === 'vegan' ? ['milk', 'eggs', 'fish', 'crustaceans', 'molluscs'] : [];
        return (
          <>
            <Text color="textMuted">{t('onboarding.diet.allergies.hint')}</Text>
            <ChoiceGroup
              options={Allergen.options
                .filter((a) => !hidden.includes(a))
                .map((v) => ({ value: v, label: t(`enums.allergen.${v}`) }))}
              selected={draft.nutrition.allergies ?? []}
              onToggle={(v) => update('nutrition', { allergies: toggle(draft.nutrition.allergies, v) })}
            />
            <ListField
              label={t('onboarding.diet.allergies.intolerances')}
              value={draft.nutrition.intolerances}
              onChange={(intolerances) => update('nutrition', { intolerances })}
            />
            <ExclusionSummary intolerances={draft.nutrition.intolerances} />
          </>
        );
      }
      case 'diet.foods':
        return (
          <>
            <Text color="textMuted">{t('onboarding.diet.foods.hint')}</Text>
            <ListField
              label={t('onboarding.diet.foods.excluded')}
              value={draft.nutrition.excludedFoods}
              onChange={(excludedFoods) => update('nutrition', { excludedFoods })}
            />
            <ExclusionSummary excluded={draft.nutrition.excludedFoods} />
            <ListField
              label={t('onboarding.diet.foods.disliked')}
              value={draft.nutrition.dislikedFoods}
              onChange={(dislikedFoods) => update('nutrition', { dislikedFoods })}
            />
            <ListField
              label={t('onboarding.diet.foods.liked')}
              value={draft.nutrition.likedFoods}
              onChange={(likedFoods) => update('nutrition', { likedFoods })}
            />
          </>
        );
      case 'diet.meals':
        return (
          <>
            <Text variant="label">{t('onboarding.diet.meals.meals')}</Text>
            <ChoiceGroup
              options={MEALS.map((v) => ({ value: v, label: String(v) }))}
              selected={single(draft.nutrition.mealsPerDay)}
              onToggle={(mealsPerDay) => update('nutrition', { mealsPerDay })}
            />
            <Text variant="label">{t('onboarding.diet.meals.cooking')}</Text>
            <ChoiceGroup
              options={COOKING.map((v) => ({ value: v, label: t('common.minutes', { count: v }) }))}
              selected={single(draft.nutrition.cookingMinutes)}
              onToggle={(cookingMinutes) => update('nutrition', { cookingMinutes })}
            />
          </>
        );
      case 'training.gym':
        return (
          <ChoiceGroup
            options={[
              { value: 'yes', label: t('common.yes') },
              { value: 'no', label: t('common.no') },
            ]}
            selected={draft.training.hasGym === undefined ? [] : [draft.training.hasGym ? 'yes' : 'no']}
            onToggle={(v) => update('training', { hasGym: v === 'yes' })}
          />
        );
      case 'training.gymDetails':
        return (
          <>
            <Text color="textMuted">{t('onboarding.training.gymDetails.hint')}</Text>
            <TextField
              label={t('onboarding.training.gymDetails.name')}
              value={draft.training.gymName ?? ''}
              onChangeText={(gymName) => update('training', { gymName })}
            />
            <ChoiceGroup
              options={[{ value: 'member', label: t('onboarding.training.gymDetails.membership') }]}
              selected={draft.training.hasMembership ? ['member'] : []}
              onToggle={() => update('training', { hasMembership: !draft.training.hasMembership })}
            />
            <NumberField
              label={t('onboarding.training.gymDetails.travel')}
              value={draft.training.gymTravelMinutes}
              onChange={(v) => update('training', { gymTravelMinutes: v === undefined ? undefined : Math.round(v) })}
            />
          </>
        );
      case 'training.homeEquipment':
        return (
          <>
            <Text color="textMuted">{t('onboarding.training.homeEquipment.hint')}</Text>
            <ChoiceGroup
              options={Equipment.options
                .filter((e) => e !== 'bodyweight')
                .map((v) => ({ value: v, label: t(`enums.equipment.${v}`) }))}
              selected={draft.training.equipment ?? []}
              onToggle={(v) => update('training', { equipment: toggle(draft.training.equipment, v) })}
            />
          </>
        );
      case 'training.level':
        return (
          <ChoiceGroup
            options={TrainingLevel.options.map((v) => ({ value: v, label: t(`enums.level.${v}`) }))}
            selected={single(draft.training.level)}
            onToggle={(level) => update('training', { level })}
          />
        );
      case 'training.frequency':
        return (
          <>
            <Text variant="label">{t('onboarding.training.frequency.sessions')}</Text>
            <ChoiceGroup
              options={SESSIONS.map((v) => ({ value: v, label: String(v) }))}
              selected={single(draft.training.sessionsPerWeek)}
              onToggle={(sessionsPerWeek) => update('training', { sessionsPerWeek })}
            />
            <Text variant="label">{t('onboarding.training.frequency.duration')}</Text>
            <ChoiceGroup
              options={DURATIONS.map((v) => ({ value: v, label: t('common.minutes', { count: v }) }))}
              selected={single(draft.training.sessionMinutes)}
              onToggle={(sessionMinutes) => update('training', { sessionMinutes })}
            />
          </>
        );
      case 'training.sports':
        return (
          <>
            <ListField
              label={t('onboarding.training.sports.liked')}
              hint={t('onboarding.training.sports.hint')}
              value={draft.training.likedSports}
              onChange={(likedSports) => update('training', { likedSports })}
            />
            <ListField
              label={t('onboarding.training.sports.refused')}
              value={draft.training.refusedSports}
              onChange={(refusedSports) => update('training', { refusedSports })}
            />
          </>
        );
      case 'training.refusedExercises':
        return (
          <>
            <Text color="textMuted">{t('onboarding.training.refusedExercises.hint')}</Text>
            <ChoiceGroup
              options={EXERCISES.map((e) => ({ value: e.id, label: e.name[lang] }))}
              selected={draft.training.refusedExerciseIds ?? []}
              onToggle={(id) =>
                update('training', { refusedExerciseIds: toggle(draft.training.refusedExerciseIds, id) })
              }
            />
          </>
        );
      case 'schedule.availability':
        return (
          <>
            <Text color="textMuted">{t('onboarding.schedule.availability.hint')}</Text>
            <ScheduleEditor
              availability={draft.schedule.availability ?? []}
              constraints={draft.schedule.fixedConstraints ?? []}
              onChange={(next) => update('schedule', next)}
            />
          </>
        );
      case 'review':
        return <Review draft={draft} />;
    }
  })();

  return (
    <View style={{ gap: spacing.lg }}>
      <Text variant="title">{step === 'review' ? t('onboarding.review.title') : title}</Text>
      {body}
    </View>
  );
}

function Review({ draft }: { draft: OnboardingDraft }) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const result = buildSnapshot(draft, now);
  if (!result.ok)
    return (
      <Banner
        tone="danger"
        message={t('onboarding.review.invalid', { steps: result.issues.map((i) => i.split(':')[0]).join(', ') })}
      />
    );
  const s = result.snapshot;
  const targets = computeNutritionTargets(s, now.getFullYear());
  const feasibility = assessGoalFeasibility(s, now.toISOString().slice(0, 10));
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
