import { useMemo, useState } from 'react';

import {
  buildSnapshot,
  draftFromSnapshot,
  emptyDraft,
  getStep,
  type OnboardingDraft,
  type OnboardingStepId,
} from '@/domain/onboarding/steps';
import { editedSnapshot, profileImpact } from '@/domain/settings/impact';
import { SECTION_STEPS, type SettingsSection } from '@/domain/settings/sections';
import { useDataStore } from '@/state/data';
import { useProfileStore } from '@/state/profile';

import { commitProfile } from './useCommitProfile';

type Update = <K extends keyof OnboardingDraft>(section: K, patch: Partial<OnboardingDraft[K]>) => void;

/**
 * Edit form of one section of the profile (D-043): the same questions as the onboarding, on a copy
 * of the saved profile. Nothing is saved before "Enregistrer"; a change that matters (new program
 * version, goal, allergy removed, an adaptation replaced) is confirmed on a preview first.
 */
export function useProfileEdit(section: SettingsSection) {
  const saved = useProfileStore((s) => s.snapshot);
  const adjustments = useDataStore((s) => s.adjustments);
  const [draft, setDraft] = useState<OnboardingDraft>(() => (saved ? draftFromSnapshot(saved) : emptyDraft()));
  const [confirming, setConfirming] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const year = new Date().getFullYear();

  const update: Update = (key, patch) => {
    setJustSaved(false);
    setConfirming(false);
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  };

  const steps: OnboardingStepId[] = SECTION_STEPS[section].filter((id) => getStep(id).isVisible(draft));
  const incomplete = steps.filter((id) => !getStep(id).isComplete(draft, year));
  const built = useMemo(() => buildSnapshot(draft, new Date()), [draft]);
  const next = useMemo(() => (saved && built.ok ? editedSnapshot(saved, built.snapshot) : null), [saved, built]);
  const impact = useMemo(
    () => (saved && next ? profileImpact({ saved, next, adjustments }) : null),
    [saved, next, adjustments],
  );
  const draftChanged = dirtyDraft(saved, draft);
  /** Unsaved edits: what the preview lists, or an incomplete draft the user typed (still guarded). */
  const dirty = built.ok && impact ? impact.changes.length > 0 : draftChanged;
  /** Questions of this section that block saving (missing or out of range). */
  const invalid = incomplete.length > 0 || (!built.ok && draftChanged);

  const save = (): 'saved' | 'confirm' | 'invalid' | 'unchanged' => {
    if (!saved || !next || !impact || invalid) return 'invalid';
    if (!dirty) return 'unchanged';
    if (impact.needsConfirmation && !confirming) {
      setConfirming(true);
      return 'confirm';
    }
    commitProfile(next, impact);
    setConfirming(false);
    setJustSaved(true);
    setDraft(draftFromSnapshot(next));
    return 'saved';
  };

  const discard = () => {
    if (saved) setDraft(draftFromSnapshot(saved));
    setConfirming(false);
  };

  return {
    saved,
    draft,
    update,
    steps,
    impact,
    dirty,
    invalid,
    issues: built.ok ? [] : built.issues,
    incomplete,
    confirming,
    justSaved,
    save,
    cancelConfirm: () => setConfirming(false),
    discard,
  };
}

/** A draft that differs from the saved profile (an invalid untouched profile is not the user's doing). */
function dirtyDraft(saved: ReturnType<typeof useProfileStore.getState>['snapshot'], draft: OnboardingDraft): boolean {
  return !saved || JSON.stringify(draftFromSnapshot(saved)) !== JSON.stringify(draft);
}
