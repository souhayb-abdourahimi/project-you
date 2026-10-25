import { useCallback, useEffect, useRef, useState } from 'react';

import { FOOD_CATALOG } from '@/domain/meals/catalog';
import {
  addFood,
  draftFromDetection,
  emptyDraft,
  removeItem,
  setFood,
  setPortion,
  toLoggedMeal,
  type MealDraft,
} from '@/domain/meals/photo-analysis';
import type { MealSlot } from '@/domain/meals/recipes';
import type { IsoDate } from '@/domain/shared/dates';
import { newId } from '@/lib/id';
import { providers } from '@/providers';
import type { MealPhoto } from '@/providers/types';
import { pickMealPhoto } from '@/services/mealPhoto';
import { isSupabaseConfigured } from '@/services/supabase';
import { cameraCaptureAvailable } from '@/services/web';
import { useDataStore } from '@/state/data';

/**
 * start: choose a photo or compose by hand. preview: the photo, sent only after "Analyser".
 * analyzing: request in flight (cancellable). review: the draft to check and correct.
 * unavailable: no analysis service configured. error: the request failed (retry or compose).
 */
export type AnalysisPhase = 'start' | 'preview' | 'analyzing' | 'review' | 'unavailable' | 'error';

export type AnalysisIssue =
  'denied' | 'too_large' | 'pick_failed' | 'timeout' | 'network' | 'service' | 'rate_limited' | 'auth' | 'unknown';

/** Issues where "Réessayer" can help; the others offer composing by hand only. */
export const RETRYABLE_ISSUES: readonly AnalysisIssue[] = ['timeout', 'network', 'service', 'unknown'];

/** The catalogue the vision service may choose from (ids and French names, nothing personal). */
const CATALOG = FOOD_CATALOG.map((f) => ({ id: f.id, name: f.name.fr }));

/**
 * View model of the meal analysis screen (W-10). The screen only renders this: a photo is sent only
 * after an explicit tap, the result is a draft computed from Ciqual (domain), every correction is
 * recomputed, and nothing is saved before "Confirmer et ajouter" on a complete draft.
 */
export function useMealAnalysis(date: IsoDate) {
  const addLoggedMeal = useDataStore((s) => s.addLoggedMeal);
  const [phase, setPhase] = useState<AnalysisPhase>('start');
  const [issue, setIssue] = useState<AnalysisIssue | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [photo, setPhoto] = useState<MealPhoto | null>(null);
  const [draft, setDraft] = useState<MealDraft>(emptyDraft());
  const [slot, setSlot] = useState<MealSlot | null>(null);
  const request = useRef<AbortController | null>(null);
  // One id per meal being composed: a second tap on "Confirmer" rewrites the same row, never adds one.
  const mealId = useRef(newId());

  // Leaving the screen cancels the request: no photo upload, no state update after unmount.
  useEffect(() => () => request.current?.abort(), []);
  // The web preview is an in-memory blob: released when the photo changes or the screen closes.
  useEffect(
    () => () => {
      if (uri?.startsWith('blob:')) URL.revokeObjectURL(uri);
    },
    [uri],
  );

  const choose = useCallback(async (source: 'camera' | 'library') => {
    setIssue(null);
    const picked = await pickMealPhoto(source);
    if (picked.status === 'cancelled') return;
    if (picked.status !== 'ok') {
      setIssue(picked.status === 'failed' ? 'pick_failed' : picked.status);
      return;
    }
    setUri(picked.uri);
    setPhoto(picked.photo);
    setPhase('preview');
  }, []);

  const analyze = useCallback(async () => {
    if (!photo || request.current) return; // already running: a second tap sends nothing
    setIssue(null);
    setPhase('analyzing');
    const controller = new AbortController();
    request.current = controller;
    const result = await providers.mealPhoto.analyze(photo, CATALOG, controller.signal);
    if (request.current !== controller) return; // cancelled, or superseded by another attempt
    request.current = null;
    if (result.status === 'ok') {
      setDraft(draftFromDetection(result.data));
      setPhase('review');
    } else if (result.status === 'unavailable') {
      setPhase('unavailable');
    } else {
      setIssue(result.error === 'offline' ? 'network' : result.error);
      setPhase('error');
    }
  }, [photo]);

  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setPhase(photo ? 'preview' : 'start');
  }, [photo]);

  const restart = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setUri(null);
    setPhoto(null);
    setIssue(null);
    setDraft(emptyDraft());
    mealId.current = newId();
    setPhase('start');
  }, []);

  /** Compose by hand from the catalogue (no photo, no service): same draft, same rules. */
  const composeManually = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setIssue(null);
    setDraft((d) => (d.items.length > 0 ? d : emptyDraft('manual')));
    setPhase('review');
  }, []);

  /** Saves the meal: only a complete draft, only now. Returns false when it cannot be saved. */
  const confirm = useCallback((): boolean => {
    const meal = toLoggedMeal(draft, { id: mealId.current, date, slot, at: new Date().toISOString() });
    if (!meal) return false;
    addLoggedMeal(meal);
    return true;
  }, [draft, date, slot, addLoggedMeal]);

  return {
    /** False in local mode (no account service): the photo analysis cannot run, composing can. */
    photoAvailable: isSupabaseConfigured,
    /** False on a computer's browser: only "choose a photo" is offered there. */
    cameraAvailable: cameraCaptureAvailable(),
    phase,
    issue,
    uri,
    draft,
    slot,
    setSlot,
    choose,
    analyze,
    cancel,
    restart,
    composeManually,
    confirm,
    edit: {
      portion: (key: string, grams: number | null) => setDraft((d) => setPortion(d, key, grams)),
      food: (key: string, foodId: string) => setDraft((d) => setFood(d, key, foodId)),
      remove: (key: string) => setDraft((d) => removeItem(d, key)),
      add: (foodId: string) => setDraft((d) => addFood(d, foodId)),
    },
  };
}

export type MealAnalysis = ReturnType<typeof useMealAnalysis>;
