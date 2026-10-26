import type { DraftSection, OnboardingDraft } from '@/domain/onboarding/steps';

/** Patches one answer group of the draft (questionnaire and Réglages share it). */
export type Update = <K extends DraftSection>(section: K, patch: Partial<OnboardingDraft[K]>) => void;
