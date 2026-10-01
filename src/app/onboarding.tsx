import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, ProgressBar, Row, Screen, Text } from '@/components/ui';
import {
  buildSnapshot,
  getStep,
  nextStepId,
  previousStepId,
  progressOf,
  removedAllergies,
  visibleSteps,
} from '@/domain/onboarding/steps';
import { StepContent } from '@/features/onboarding/StepContent';
import { useSession } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import type { Allergen } from '@/domain/profile/schemas';
import { useProfileStore } from '@/state/profile';
import { spacing } from '@/theme';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { draft, currentStep, updateDraft, setStep, complete, localMode, snapshot } = useProfileStore();
  const { session, loading } = useSession();
  // Allergies of the saved profile that the new answers drop: saved only after an explicit "yes" (B2).
  const [removing, setRemoving] = useState<Allergen[] | null>(null);

  if (loading) return null;
  if (isSupabaseConfigured && !session && !localMode) return <Redirect href="/sign-in" />;

  const steps = visibleSteps(draft);
  // The current step may have become hidden after an earlier answer changed.
  const step = steps.some((s) => s.id === currentStep) ? currentStep : steps[0].id;
  const index = steps.findIndex((s) => s.id === step);
  const canContinue = getStep(step).isComplete(draft, new Date().getFullYear());
  const previous = previousStepId(draft, step);

  const next = () => {
    const nextId = nextStepId(draft, step);
    if (nextId) {
      setStep(nextId);
      return;
    }
    const result = buildSnapshot(draft, new Date());
    if (!result.ok) return;
    const removed = removedAllergies(snapshot, result.snapshot);
    if (removed.length > 0 && removing === null) {
      setRemoving(removed);
      return;
    }
    setRemoving(null);
    complete(result.snapshot);
    router.replace('/');
  };

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <Text variant="caption" color="textMuted">
          {t(`onboarding.sections.${getStep(step).section}`)} ·{' '}
          {t('onboarding.progress', { current: index + 1, total: steps.length })}
        </Text>
        <ProgressBar
          value={progressOf(draft, step)}
          label={t('onboarding.progress', { current: index + 1, total: steps.length })}
        />
      </View>
      <StepContent key={step} step={step} draft={draft} update={updateDraft} />
      {removing && step === 'review' ? (
        <Card>
          <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ gap: spacing.sm }}>
            <Text variant="heading" color="danger">
              {t(
                removing.length > 1 ? 'onboarding.review.removeAllergiesMany' : 'onboarding.review.removeAllergiesOne',
              )}
            </Text>
            {removing.map((a) => (
              <Text key={a}>- {t(`enums.allergen.${a}`)}</Text>
            ))}
            <Text>{t('onboarding.review.removeAllergiesConfirm')}</Text>
          </View>
          <Button variant="danger" label={t('onboarding.review.removeAllergiesYes')} onPress={next} />
          <Button
            variant="secondary"
            label={t('onboarding.review.removeAllergiesNo')}
            onPress={() => {
              setRemoving(null);
              setStep('diet.allergies');
            }}
          />
        </Card>
      ) : null}
      <Row>
        {previous ? (
          <Button
            variant="ghost"
            label={t('common.back')}
            onPress={() => {
              setRemoving(null);
              setStep(previous);
            }}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <Button
            label={step === 'review' ? t('onboarding.review.finish') : t('common.continue')}
            onPress={next}
            disabled={
              !canContinue || (step === 'review' && (!buildSnapshot(draft, new Date()).ok || removing !== null))
            }
          />
        </View>
      </Row>
    </Screen>
  );
}
