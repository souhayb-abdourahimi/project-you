import type { Adjustment } from '../../journey/adjustments';
import { appliedCalorieOffset, appliedSessionsPerWeek } from '../../journey/adjustments';
import { ONBOARDING_STEPS } from '../../onboarding/steps';
import type { UserContextSnapshot } from '../../profile/schemas';
import { SCENARIOS } from '../../scenarios';
import { editedSnapshot, profileImpact, replacementRows } from '../impact';
import { NOT_A_SETTING, SECTION_STEPS, SETTINGS_SECTIONS, isSettingsSection, sectionOf } from '../sections';
import { KG_PER_LB, fromKg, stepIn, toKg } from '../units';

const base = SCENARIOS.veganFatLoss;
const edit = (patch: (s: UserContextSnapshot) => UserContextSnapshot) => patch(structuredClone(base));

const decision = (patch: Partial<Adjustment>): Adjustment => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000010',
  kind: 'training',
  changeKey: 'sessions_per_week',
  from: 3,
  to: 2,
  reasonKey: 'adapt.reason.missed_two_weeks',
  evidence: { adherence: 50 },
  status: 'applied',
  effectiveFrom: '2026-09-28',
  decidedAt: '2026-09-27T18:05:00.000Z',
  proposalId: 'training:sessions_per_week:2026-09-28',
  ...patch,
});
const frequency = decision({});
const offset = decision({
  id: 'aaaaaaaa-0000-4000-8000-000000000011',
  kind: 'nutrition',
  changeKey: 'calories_per_day',
  from: 0,
  to: -120,
  proposalId: 'nutrition:calories_per_day:2026-09-28',
});

describe('onboarding ↔ settings matrix (D-043)', () => {
  it('every question of the questionnaire is editable in exactly one section', () => {
    for (const step of ONBOARDING_STEPS) {
      const owners = SETTINGS_SECTIONS.filter((s) => SECTION_STEPS[s].includes(step.id));
      if (NOT_A_SETTING.includes(step.id)) expect(owners).toEqual([]);
      else expect([step.id, owners.length]).toEqual([step.id, 1]);
    }
  });
  it('a section only lists questions that exist', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    for (const s of SETTINGS_SECTIONS) for (const step of SECTION_STEPS[s]) expect(ids).toContain(step);
    expect(sectionOf('training.frequency')).toBe('training');
    expect(sectionOf('review')).toBeNull();
    expect(isSettingsSection('nutrition')).toBe(true);
    expect(isSettingsSection('../privacy')).toBe(false);
  });
});

describe('profile impact (structural changes)', () => {
  it('a name or a motivation changes nothing else and needs no confirmation', () => {
    const next = edit((s) => ({ ...s, user: { ...s.user, displayName: 'Sam' }, motivation: { ...s.motivation, why: 'santé' } }));
    const impact = profileImpact({ saved: base, next, adjustments: [] });
    expect(impact.effects).toEqual(['immediate']);
    expect(impact).toMatchObject({ newProgramVersion: false, needsConfirmation: false, replaced: [] });
  });

  it('a new frequency publishes a new program version and is confirmed first', () => {
    const next = edit((s) => ({ ...s, training: { ...s.training, sessionsPerWeek: 4 } }));
    const impact = profileImpact({ saved: base, next, adjustments: [] });
    expect(impact.newProgramVersion).toBe(true);
    expect(impact.effects[0]).toBe('program');
    expect(impact.needsConfirmation).toBe(true);
  });

  it('§24: program at 3 by adaptation, new setting 4 → the adaptation is ended, the future follows 4', () => {
    const saved = edit((s) => ({ ...s, training: { ...s.training, sessionsPerWeek: 3 } }));
    const adapted = decision({ from: 3, to: 3 });
    const next = { ...saved, training: { ...saved.training, sessionsPerWeek: 4 } };
    const impact = profileImpact({ saved, next, adjustments: [adapted] });
    expect(impact.replaced).toEqual([{ decision: adapted, reason: 'frequency_setting' }]);
    const rows = replacementRows(impact, {
      ids: ['aaaaaaaa-0000-4000-8000-000000000020'],
      today: '2026-10-07',
      decidedAt: '2026-10-07T10:00:00.000Z',
    });
    expect(rows[0]).toMatchObject({ status: 'reverted', proposalId: adapted.proposalId, evidence: { replacedBy: 'frequency_setting' } });
    // Append-only: the journal keeps the adaptation, the revert comes after it, and 4 stands.
    const journal = [adapted, ...rows];
    expect(appliedSessionsPerWeek(journal)).toBeNull();
    expect(journal).toContain(adapted);
  });

  it('changing something else keeps the frequency adaptation in force', () => {
    const next = edit((s) => ({ ...s, user: { ...s.user, displayName: 'Sam' } }));
    expect(profileImpact({ saved: base, next, adjustments: [frequency] }).replaced).toEqual([]);
  });

  it('a new goal ends the calorie offset of the old goal and is confirmed', () => {
    const next = edit((s) => ({ ...s, goal: { ...s.goal, type: 'maintenance' } }));
    const impact = profileImpact({ saved: base, next, adjustments: [offset] });
    expect(impact.replaced.map((r) => r.reason)).toEqual(['goal_changed']);
    expect(impact.effects).toEqual(expect.arrayContaining(['targets', 'meals']));
    expect(impact.needsConfirmation).toBe(true);
    const rows = replacementRows(impact, { ids: ['x'], today: '2026-10-07', decidedAt: '2026-10-07T10:00:00.000Z' });
    expect(appliedCalorieOffset([offset, ...rows])).toBe(0);
  });

  it('removing an allergy is never silent; adding one needs no extra confirmation', () => {
    const allergic = edit((s) => ({ ...s, nutrition: { ...s.nutrition, allergies: ['peanuts', 'sesame'] } }));
    const removed = profileImpact({
      saved: allergic,
      next: { ...allergic, nutrition: { ...allergic.nutrition, allergies: ['sesame'] } },
      adjustments: [],
    });
    expect(removed).toMatchObject({ removedAllergies: ['peanuts'], needsConfirmation: true, effects: ['meals'] });
    const added = profileImpact({ saved: base, next: allergic, adjustments: [] });
    expect(added).toMatchObject({ removedAllergies: [], needsConfirmation: false, effects: ['meals'] });
  });

  it('availability places the sessions again without a new version', () => {
    const next = edit((s) => ({ ...s, schedule: { ...s.schedule, availability: s.schedule.availability.slice(1) } }));
    const impact = profileImpact({ saved: base, next, adjustments: [] });
    expect(impact.effects).toContain('schedule');
    expect(impact.newProgramVersion).toBe(false);
  });

  it('an edited profile keeps the account start and the measured weight', () => {
    const edited = edit((s) => ({ ...s, createdAt: '2030-01-01T00:00:00.000Z', user: { ...s.user, weightKg: 50 } }));
    const saved = { ...base, preferences: { ...base.preferences, weightUnit: 'lb' as const } };
    const out = editedSnapshot(saved, edited);
    expect(out.createdAt).toBe(base.createdAt);
    expect(out.user.weightKg).toBe(base.user.weightKg);
    expect(out.preferences.weightUnit).toBe('lb');
  });
});

describe('mass units (canonical kg)', () => {
  it('converts for display only, rounded like a scale', () => {
    expect(fromKg(80, 'kg')).toBe(80);
    expect(fromKg(80, 'lb')).toBe(176.4);
    expect(fromKg(16.25, 'kg')).toBe(16.25);
  });
  it('a value typed in lb is stored in kg once and shows back as typed', () => {
    const kg = toKg(135, 'lb');
    expect(kg).toBeCloseTo(135 * KG_PER_LB, 10);
    expect(fromKg(kg, 'lb')).toBe(135);
    expect(toKg(72.5, 'kg')).toBe(72.5);
  });
  it('switching unit back and forth never changes a stored value', () => {
    const history = [91.4, 90.85, 16.25];
    const shown = history.map((kg) => fromKg(kg, 'lb'));
    expect(shown).toEqual([201.5, 200.3, 35.8]);
    expect(history.map((kg) => fromKg(kg, 'kg'))).toEqual(history);
  });
  it('load steps follow the unit', () => {
    expect(stepIn(2.5, 'kg')).toBe(2.5);
    expect(stepIn(2.5, 'lb')).toBe(5.5);
  });
});
