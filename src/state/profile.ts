import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { emptyDraft, type OnboardingDraft, type OnboardingStepId } from '@/domain/onboarding/steps';
import type { UserContextSnapshot } from '@/domain/profile/schemas';

import { persistStorage } from './storage';

type DraftSection = keyof OnboardingDraft;

interface ProfileState {
  draft: OnboardingDraft;
  currentStep: OnboardingStepId;
  snapshot: UserContextSnapshot | null;
  /** The user chose to use the app without an account (data stays on the device). */
  localMode: boolean;
  updateDraft: <K extends DraftSection>(section: K, patch: Partial<OnboardingDraft[K]>) => void;
  setStep: (step: OnboardingStepId) => void;
  complete: (snapshot: UserContextSnapshot) => void;
  setLocalMode: (value: boolean) => void;
  restartOnboarding: () => void;
  reset: () => void;
}

const initial = {
  draft: emptyDraft(),
  currentStep: 'profile.name' as OnboardingStepId,
  snapshot: null,
  localMode: false,
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      ...initial,
      updateDraft: (section, patch) =>
        set((s) => ({ draft: { ...s.draft, [section]: { ...s.draft[section], ...patch } } })),
      setStep: (currentStep) => set({ currentStep }),
      complete: (snapshot) => set({ snapshot }),
      setLocalMode: (localMode) => set({ localMode }),
      restartOnboarding: () => set({ currentStep: 'profile.name' }),
      reset: () => set({ ...initial, draft: emptyDraft() }),
    }),
    { name: 'py.profile.v1', storage: persistStorage, version: 1 },
  ),
);
