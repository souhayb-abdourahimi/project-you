/**
 * How a structural proposal is told (W-5, D-037 §18, §27, §36): what changes, why (the real facts
 * the engine used), for how long, and what it does in the sessions, with the answers it accepts.
 * Pure: i18n keys and parameters only, the screen translates. Nothing here decides; the words come
 * from the same `Recommendation` the Adaptation Engine produced.
 */
import type { Recommendation } from './adaptation';
import { cycleOptionScope, type ProposalScope } from './structural';
import { idList, isStructural, STRUCTURE, type CycleOption } from '../training/structure';

export interface Copy {
  key: string;
  params: Record<string, string | number>;
}

export interface ProposalAnswer {
  /** The option of an end-of-cycle review, or null for the proposal itself. */
  option: CycleOption | null;
  label: Copy;
  /** How long the chosen answer lasts (null: nothing changes, e.g. "continuer"). */
  scope: ProposalScope | null;
}

export interface ProposalView {
  id: string;
  changeKey: string;
  /** The coach's sentence: the facts and what can be done (the reason of the engine). */
  message: Copy;
  /** What changes, exactly (null: the screen uses the generic label of the change). */
  change: Copy | null;
  duration: Copy | null;
  impact: Copy | null;
  /** "Pourquoi ?": each fact the engine read, with its value. */
  why: Copy[];
  /** The answers that apply something (one, or one per option at the end of a cycle). */
  answers: ProposalAnswer[];
  /** Label of the refusal ("Refuser", or "Le garder" for an exercise). */
  declineLabel: Copy;
  /** A durable change asks for a confirmation before it applies (D-037 §8). */
  confirm: Copy | null;
}

const copy = (key: string, params: Record<string, string | number> = {}): Copy => ({ key, params });

const APPLY_LABEL: Record<string, string> = {
  light_week: 'adaptation.applyLabel.light_week',
  restart: 'adaptation.applyLabel.restart',
  reduce_volume: 'adaptation.applyLabel.reduce_volume',
  easier_variant: 'adaptation.applyLabel.easier_variant',
  exercise_change: 'adaptation.applyLabel.exercise_change',
};

function durationOf(scope: ProposalScope | null | undefined, changeKey: string): Copy | null {
  if (!scope) return changeKey === 'cycle_review' ? copy('adaptation.duration.choice') : null;
  switch (scope.kind) {
    case 'week':
      return copy('adaptation.duration.week', { days: scope.days ?? STRUCTURE.lightWeekDays });
    case 'weeks':
      return copy('adaptation.duration.weeks', { weeks: Math.round((scope.days ?? 14) / 7) });
    case 'sessions':
      return copy('adaptation.duration.sessions', { sessions: scope.sessions ?? 1, days: scope.days ?? 0 });
    case 'durable':
      return copy('adaptation.duration.durable');
    default:
      return copy('adaptation.duration.session');
  }
}

/** "Squat → Goblet squat, Tractions → Tirage vertical": the pairs of a change, by name. */
const pairs = (from: string | number | undefined, to: string | number | undefined, name: (id: string) => string) => {
  const target = idList(typeof to === 'string' ? to : undefined);
  return idList(typeof from === 'string' ? from : undefined)
    .map((id, i) => (target[i] ? `${name(id)} → ${name(target[i])}` : name(id)))
    .join(', ');
};

function changeOf(r: Recommendation, name: (id: string) => string): Copy | null {
  const { key, from, to } = r.change;
  switch (key) {
    case 'restart':
      return copy('adaptation.change.restart', { sessions: Number(to) || STRUCTURE.restartSessions });
    case 'reduce_volume':
      return copy('adaptation.change.reduce_volume', {
        weeks: STRUCTURE.reduceVolumeDays / 7,
        min: STRUCTURE.minSets,
      });
    case 'easier_variant':
      return copy('adaptation.change.easier_variant', { list: pairs(from, to, name) });
    case 'exercise_change':
      return typeof to === 'string' && to
        ? copy('adaptation.change.exercise_change', { from: name(String(from)), to: name(to) })
        : copy('adaptation.change.exercise_remove', { from: name(String(from)) });
    case 'cycle_review':
      return copy('adaptation.change.cycle_review', { weeks: Number(r.evidence.weeks) || 6 });
    default:
      return null;
  }
}

export function proposalView(r: Recommendation, name: (id: string) => string): ProposalView {
  const key = r.change.key;
  const structural = isStructural(key);
  const options = r.options ?? [];
  const answers: ProposalAnswer[] =
    options.length > 0
      ? options.map((option) => ({
          option,
          label: copy(`adaptation.option.${option}`),
          scope: cycleOptionScope(option),
        }))
      : [{ option: null, label: copy(APPLY_LABEL[key] ?? 'adaptation.apply'), scope: r.scope ?? null }];
  const evolution = key === 'cycle_review' && options.includes('evolve') ? pairs(r.change.from, undefined, name) : '';
  return {
    id: r.id,
    changeKey: key,
    message: copy(r.reason.key, r.reason.params),
    change: changeOf(r, name),
    duration: structural ? durationOf(r.scope, key) : null,
    impact: structural
      ? copy(evolution ? 'adaptation.impact.cycle_evolve' : `adaptation.impact.${key}`, {
          min: STRUCTURE.minSets,
          rpe: STRUCTURE.restartRpe,
          ...(evolution ? { list: evolution } : {}),
        })
      : null,
    why: Object.entries(r.evidence).map(([k, v]) => copy(`adaptation.evidence.${k}`, { value: v })),
    answers,
    declineLabel: copy(key === 'exercise_change' ? 'adaptation.keep' : 'adaptation.decline'),
    confirm: key === 'exercise_change' ? copy('adaptation.confirm.exercise_change') : null,
  };
}
