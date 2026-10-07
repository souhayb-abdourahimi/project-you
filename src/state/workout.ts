import { create } from 'zustand';

import { extendRest, pauseRest, resumeRest, startRest, type RestTimer } from '@/domain/training/session';

interface Rest extends RestTimer {
  session: string;
  exerciseId: string;
}

interface WorkoutUiState {
  /** Rest after a set: timestamps, so it keeps counting across screens (never persisted). */
  rest: Rest | null;
  startRest: (session: string, exerciseId: string, seconds: number) => void;
  skipRest: () => void;
  extendRest: () => void;
  pauseRest: () => void;
  resumeRest: () => void;
}

/** Live state of the session in progress on this device; the facts themselves are in the data store. */
export const useWorkoutUi = create<WorkoutUiState>()((set) => ({
  rest: null,
  startRest: (session, exerciseId, seconds) =>
    set({ rest: seconds > 0 ? { ...startRest(Date.now(), seconds), session, exerciseId } : null }),
  skipRest: () => set({ rest: null }),
  extendRest: () => set((s) => (s.rest ? { rest: { ...s.rest, ...extendRest(s.rest, Date.now()) } } : {})),
  pauseRest: () => set((s) => (s.rest ? { rest: { ...s.rest, ...pauseRest(s.rest, Date.now()) } } : {})),
  resumeRest: () => set((s) => (s.rest ? { rest: { ...s.rest, ...resumeRest(s.rest, Date.now()) } } : {})),
}));
