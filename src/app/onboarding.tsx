import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, ProgressBar, Row, Screen, Text } from '@/components/ui';
import {
  autoAdvances,
  blockedReason,
  buildSnapshot,
  emptyAnswerLabel,
  firstIncompleteStep,
  getStep,
  nextStepId,
  previousStepId,
  progressOf,
  removedAllergies,
  visibleSteps,
} from '@/domain/onboarding/steps';
import { StepContent } from '@/features/onboarding/StepContent';
import { ChangePreview } from '@/features/settings/ChangePreview';
import { commitProfile } from '@/features/settings/useCommitProfile';
import { editedSnapshot, profileImpact } from '@/domain/settings/impact';
import { toIsoDate } from '@/domain/shared/dates';
import { useDataStore } from '@/state/data';
import { useSession } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import type { Allergen } from '@/domain/profile/schemas';
import { useProfileStore } from '@/state/profile';
import { spacing, useReducedMotion } from '@/theme';

/** Long enough to see the answer selected, short enough not to wait (≤ 250 ms, UI rules). */
const ADVANCE_MS = 220;

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { draft, currentStep, updateDraft, setStep, complete, localMode, snapshot } = useProfileStore();
  const adjustments = useDataStore((s) => s.adjustments);
  const { session, loading } = useSession();
  // Allergies of the saved profile that the new answers drop: saved only after an explicit "yes" (B2).
  const [removing, setRemoving] = useState<Allergen[] | null>(null);
  const reduceMotion = useReducedMotion();
  // A pending automatic "next" after a one-answer question (cleared on any other move).
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAdvance = () => {
    if (advance.current) clearTimeout(advance.current);
    advance.current = null;
  };
  useEffect(() => cancelAdvance, [currentStep]);

  if (loading) return null;
  if (isSupabaseConfigured && !session && !localMode) return <Redirect href="/sign-in" />;

  const year = new Date().getFullYear();
  const steps = visibleSteps(draft);
  // The current step may have become hidden after an earlier answer changed (or no longer exist
  // after an update): go back to the first question still unanswered, not to the start.
  const step = steps.some((s) => s.id === currentStep)
    ? currentStep
    : (firstIncompleteStep(draft, year) ?? steps[0].id);
  const index = steps.findIndex((s) => s.id === step);
  const canContinue = getStep(step).isComplete(draft, year);
  const blocked = blockedReason(draft, step, year);
  const emptyLabel = emptyAnswerLabel(draft, step);
  const previous = previousStepId(draft, step);
  const single = autoAdvances(step);

  const next = () => {
    cancelAdvance();
    // The latest answers (an automatic "next" runs after the tap that changed them).
    const draft = useProfileStore.getState().draft;
    if (!getStep(step).isComplete(draft, year)) return;
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
    if (snapshot) {
      // Questionnaire done again (D-043): same contract as Réglages. The start of the journey is kept,
      // a new weight is a weigh-in of today (the history is never typed over), and the adaptations
      // the new answers replace are ended in the journal.
      const next = editedSnapshot(snapshot, result.snapshot);
      if (result.snapshot.user.weightKg !== snapshot.user.weightKg) {
        useDataStore.getState().logWeight(toIsoDate(new Date()), result.snapshot.user.weightKg);
      }
      commitProfile(next, profileImpact({ saved: snapshot, next, adjustments }));
    } else {
      complete(result.snapshot);
    }
    router.replace('/');
  };

  /** One-answer questions move on by themselves once answered (never in Réglages). */
  const answered = () => {
    cancelAdvance();
    // Cleared if the step changes first (Back, Continue): never two moves for one tap.
    advance.current = setTimeout(next, reduceMotion ? 0 : ADVANCE_MS);
  };

  // What saving the questionnaire again will change, shown on the summary (D-043).
  const built = step === 'review' && snapshot ? buildSnapshot(draft, new Date()) : null;
  const impact =
    built?.ok && snapshot
      ? profileImpact({ saved: snapshot, next: editedSnapshot(snapshot, built.snapshot), adjustments })
      : null;

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
      <StepContent
        key={step}
        step={step}
        draft={draft}
        update={updateDraft}
        onAnswered={single ? answered : undefined}
        onSubmit={canContinue ? next : undefined}
      />
      {impact ? <ChangePreview impact={impact} /> : null}
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
      {blocked && !(single && !canContinue) ? (
        <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite">
          {t(`onboarding.blocked.${blocked}`)}
        </Text>
      ) : null}
      <Row>
        {previous ? (
          <Button
            variant="ghost"
            label={t('common.back')}
            onPress={() => {
              cancelAdvance();
              setRemoving(null);
              setStep(previous);
            }}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          {single && !canContinue ? (
            // Nothing to confirm: touching an answer is enough (no disabled button to puzzle over).
            <Text color="textMuted" style={{ textAlign: 'center' }}>
              {t('onboarding.touchToContinue')}
            </Text>
          ) : (
            <Button
              label={
                step === 'review'
                  ? t('onboarding.review.finish')
                  : emptyLabel
                    ? t(`onboarding.empty.${emptyLabel}`)
                    : t('common.continue')
              }
              variant={emptyLabel ? 'secondary' : 'primary'}
              accessibilityHint={blocked ? t(`onboarding.blocked.${blocked}`) : undefined}
              onPress={next}
              disabled={
                !canContinue || (step === 'review' && (!buildSnapshot(draft, new Date()).ok || removing !== null))
              }
            />
          )}
        </View>
      </Row>
    </Screen>
  );
}
