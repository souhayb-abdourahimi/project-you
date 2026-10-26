import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ChoiceGroup, Text, TextField } from '@/components/ui';
import {
  HEIGHT_RANGE,
  WEIGHT_RANGE,
  checkAge,
  type OnboardingDraft,
  type OnboardingStepId,
} from '@/domain/onboarding/steps';
import { Allergen, Equipment, KitchenEquipment } from '@/domain/profile/schemas';
import { EXERCISES } from '@/domain/training/exercises';
import { ExclusionSummary } from '@/features/nutrition/ExclusionSummary';
import { spacing } from '@/theme';

import { ChoiceStep, isChoiceStep } from './ChoiceStep';
import { ListField, MassField, NumberField, toggle } from './fields';
import { MotivationMore, MotivationStep } from './MotivationStep';
import { BudgetStep, TargetStep } from './PlanningSteps';
import { ReviewStep } from './ReviewStep';
import { ScheduleEditor } from './ScheduleEditor';
import type { Update } from './types';

const MEALS = [2, 3, 4, 5];
const COOKING = [5, 15, 30, 45, 60];
const SESSIONS = [1, 2, 3, 4, 5, 6];
const DURATIONS = [20, 30, 45, 60, 75, 90];

export function StepContent({
  step,
  draft,
  update,
  mode = 'onboarding',
  onAnswered,
  onSubmit,
}: {
  step: OnboardingStepId;
  draft: OnboardingDraft;
  update: Update;
  /** A one-answer question was answered (the questionnaire may move on, W-11). */
  onAnswered?: () => void;
  /** "Next" on the keyboard of a text step. */
  onSubmit?: () => void;
  /**
   * `settings`: the same fields, edited from Réglages (W-8, D-043). The body weight is then not a
   * field: it comes from the weigh-ins (Mon évolution), never typed over the history.
   */
  mode?: 'onboarding' | 'settings';
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const title = t(`onboarding.${step}.title`);
  const year = new Date().getFullYear();
  const single = <T extends string | number>(value: T | undefined) => (value === undefined ? [] : [value]);

  const body = (() => {
    if (isChoiceStep(step)) {
      return <ChoiceStep step={step} draft={draft} update={update} title={title} onAnswered={onAnswered} />;
    }
    switch (step) {
      case 'profile.name':
        return (
          <TextField
            label={t('onboarding.profile.name.label')}
            value={draft.user.displayName ?? ''}
            onChangeText={(displayName) => update('user', { displayName })}
            autoComplete="nickname"
            maxLength={40}
            autoFocus={mode === 'onboarding'}
            returnKeyType="next"
            onSubmitEditing={onSubmit}
          />
        );
      case 'profile.age': {
        const age = checkAge(draft, year);
        return (
          <NumberField
            label={t('onboarding.profile.age.label')}
            hint={t('onboarding.profile.age.hint')}
            value={draft.user.birthYear}
            onChange={(birthYear) => update('user', { birthYear })}
            onSubmit={onSubmit}
            // "1" of "1990" is not an error yet: the year is checked once it has 4 digits.
            deferError={draft.user.birthYear === undefined || draft.user.birthYear < 1000}
            error={
              age === 'too_young'
                ? t('onboarding.profile.age.tooYoung')
                : age === 'out_of_range'
                  ? t('onboarding.profile.age.outOfRange')
                  : undefined
            }
          />
        );
      }
      case 'profile.body': {
        const h = draft.user.heightCm;
        const w = draft.user.weightKg;
        return (
          <>
            <NumberField
              label={t('onboarding.profile.body.height')}
              value={h}
              onChange={(heightCm) => update('user', { heightCm })}
              deferError
              error={
                h !== undefined && (h < HEIGHT_RANGE.min || h > HEIGHT_RANGE.max)
                  ? t('onboarding.profile.body.heightRange', HEIGHT_RANGE)
                  : undefined
              }
            />
            {mode === 'onboarding' ? (
              <MassField
                label={(unit) => t('onboarding.profile.body.weight', { unit })}
                valueKg={w}
                onChange={(weightKg) => update('user', { weightKg })}
                onSubmit={onSubmit}
                deferError
                error={
                  w !== undefined && (w < WEIGHT_RANGE.min || w > WEIGHT_RANGE.max)
                    ? t('onboarding.profile.body.weightRange')
                    : undefined
                }
              />
            ) : (
              <Text color="textMuted">{t('settings.profile.weightFromProgress')}</Text>
            )}
          </>
        );
      }
      case 'goal.target':
        return <TargetStep draft={draft} update={update} />;
      case 'motivation.reasons':
        return <MotivationStep draft={draft} update={update} title={title} />;
      case 'motivation.more':
        return <MotivationMore draft={draft} update={update} />;
      case 'budget.food':
        return <BudgetStep draft={draft} update={update} />;
      case 'kitchen.equipment':
        return (
          <ChoiceGroup
            label={title}
            options={KitchenEquipment.options.map((v) => ({ value: v, label: t(`enums.kitchen.${v}`) }))}
            selected={draft.lifestyle.kitchen ?? []}
            onToggle={(v) => update('lifestyle', { kitchen: toggle(draft.lifestyle.kitchen, v) })}
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
              label={title}
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
              single
              label={t('onboarding.diet.meals.meals')}
              options={MEALS.map((v) => ({ value: v, label: String(v) }))}
              selected={single(draft.nutrition.mealsPerDay)}
              onToggle={(mealsPerDay) => update('nutrition', { mealsPerDay })}
            />
            <Text variant="label">{t('onboarding.diet.meals.cooking')}</Text>
            <ChoiceGroup
              single
              label={t('onboarding.diet.meals.cooking')}
              options={COOKING.map((v) => ({ value: v, label: t('common.minutes', { count: v }) }))}
              selected={single(draft.nutrition.cookingMinutes)}
              onToggle={(cookingMinutes) => update('nutrition', { cookingMinutes })}
            />
          </>
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
              label={title}
              options={Equipment.options
                .filter((e) => e !== 'bodyweight')
                .map((v) => ({ value: v, label: t(`enums.equipment.${v}`) }))}
              selected={draft.training.equipment ?? []}
              onToggle={(v) => update('training', { equipment: toggle(draft.training.equipment, v) })}
            />
          </>
        );
      case 'training.frequency':
        return (
          <>
            <Text variant="label">{t('onboarding.training.frequency.sessions')}</Text>
            <ChoiceGroup
              single
              label={t('onboarding.training.frequency.sessions')}
              options={SESSIONS.map((v) => ({ value: v, label: String(v) }))}
              selected={single(draft.training.sessionsPerWeek)}
              onToggle={(sessionsPerWeek) => update('training', { sessionsPerWeek })}
            />
            <Text variant="label">{t('onboarding.training.frequency.duration')}</Text>
            <ChoiceGroup
              single
              label={t('onboarding.training.frequency.duration')}
              options={DURATIONS.map((v) => ({ value: v, label: t('common.minutes', { count: v }) }))}
              selected={single(draft.training.sessionMinutes)}
              onToggle={(sessionMinutes) => update('training', { sessionMinutes })}
            />
          </>
        );
      case 'training.refusedExercises':
        return (
          <>
            <Text color="textMuted">{t('onboarding.training.refusedExercises.hint')}</Text>
            <ChoiceGroup
              label={title}
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
        return <ReviewStep draft={draft} />;
    }
  })();

  return (
    <View style={{ gap: spacing.lg }}>
      <Text variant={mode === 'settings' ? 'heading' : 'title'} accessibilityRole="header">
        {step === 'review'
          ? t('onboarding.review.title')
          : mode === 'settings' && step === 'profile.body'
            ? t('settings.profile.bodyTitle')
            : title}
      </Text>
      {body}
    </View>
  );
}
