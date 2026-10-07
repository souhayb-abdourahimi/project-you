import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  draftFromSnapshot,
  emptyDraft,
  type DraftSection,
  type OnboardingDraft,
  type OnboardingStepId,
} from '@/domain/onboarding/steps';
import type { UserContextSnapshot } from '@/domain/profile/schemas';

import { persistStorage } from './storage';


interface ProfileState {
  draft: OnboardingDraft;
  currentStep: OnboardingStepId;
  snapshot: UserContextSnapshot | null;
  /** The user chose to use the app without an account (data stays on the device). */
  localMode: boolean;
  updateDraft: <K extends DraftSection>(section: K, patch: Partial<OnboardingDraft[K]>) => void;
  setStep: (step: OnboardingStepId) => void;
  complete: (snapshot: UserContextSnapshot) => void;
  /** Replaces the snapshot with the account's version pulled from the server. */
  setSnapshot: (snapshot: UserContextSnapshot | null) => void;
  setLocalMode: (value: boolean) => void;
  /** Restarts the questionnaire prefilled from the saved profile (never blank, never a stale draft). */
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
    (set, get) => ({
      ...initial,
      updateDraft: (section, patch) =>
        set((s) => ({ draft: { ...s.draft, [section]: { ...s.draft[section], ...patch } } })),
      setStep: (currentStep) => set({ currentStep }),
      complete: (snapshot) => set({ snapshot }),
      setSnapshot: (snapshot) => set({ snapshot }),
      setLocalMode: (localMode) => set({ localMode }),
      restartOnboarding: () => {
        const { snapshot } = get();
        set({ currentStep: 'profile.name', ...(snapshot ? { draft: draftFromSnapshot(snapshot) } : {}) });
      },
      reset: () => set({ ...initial, draft: emptyDraft() }),
    }),
    { name: 'py.profile.v1', storage: persistStorage, version: 1 },
  ),
);
