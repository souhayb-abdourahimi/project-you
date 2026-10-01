import { connectionStatus, noPermissions, readableTypes, withdrawnTypes } from '../permissions';
import { HEALTH_RETENTION_DAYS, runHealthSync, type HealthReader } from '../sync';
import { EMPTY_HEALTH_DATA, HEALTH_DATA_TYPES, type HealthData, type HealthPermissions } from '../types';

const NOW = new Date(2026, 8, 30, 12, 0);
const ALL = [...HEALTH_DATA_TYPES];
const granted: HealthPermissions = {
  weight: 'granted',
  steps: 'granted',
  workouts: 'granted',
  activeCalories: 'granted',
};
const ok = <T>(data: T) => Promise.resolve({ status: 'ok' as const, data });

/** Platform mock: what a provider would hand over. */
function fakeReader(overrides: Partial<HealthReader> = {}): HealthReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    source: 'health_connect',
    getAvailability: () => Promise.resolve('available'),
    getPermissions: () => ok(granted),
    getWeight: (r) => {
      calls.push(`weight:${r.from.toISOString()}`);
      return ok([{ id: 'w', at: new Date(2026, 8, 29, 7).toISOString(), value: 70.4, unit: 'kilograms' }]);
    },
    getSteps: () => {
      calls.push('steps');
      return ok([{ date: '2026-09-30', value: 4200, unit: 'count' }]);
    },
    getWorkouts: () => {
      calls.push('workouts');
      return ok([]);
    },
    getActiveCalories: () => {
      calls.push('activeCalories');
      return ok([{ date: '2026-09-30', value: 180, unit: 'kilocalories' }]);
    },
    ...overrides,
  };
}

const previousData: HealthData = {
  weights: [
    {
      id: 'health_connect:old',
      date: '2026-09-20',
      at: new Date(2026, 8, 20, 7).toISOString(),
      weightKg: 71,
      source: 'health_connect',
    },
  ],
  steps: [{ date: '2026-09-29', value: 9000 }],
  activeKcal: [{ date: '2026-09-29', value: 300 }],
  workouts: [],
};

describe('permissions', () => {
  it('derives the connection status', () => {
    const base = { availability: 'available' as const, connected: true, wanted: ALL };
    expect(connectionStatus({ ...base, availability: 'not_supported', permissions: granted })).toBe('unsupported');
    expect(connectionStatus({ ...base, availability: 'not_installed', permissions: granted })).toBe('unavailable');
    expect(connectionStatus({ ...base, connected: false, permissions: granted })).toBe('not_connected');
    expect(connectionStatus({ ...base, permissions: granted })).toBe('connected');
    expect(connectionStatus({ ...base, permissions: { ...granted, steps: 'denied' } })).toBe('partial');
    expect(
      connectionStatus({
        ...base,
        permissions: { weight: 'denied', steps: 'denied', workouts: 'denied', activeCalories: 'denied' },
      }),
    ).toBe('denied');
  });

  it("treats iOS 'requested' as readable, since Apple never reveals a refusal", () => {
    const ios: HealthPermissions = { ...noPermissions(), weight: 'requested', steps: 'requested' };
    expect(readableTypes(ios, ALL)).toEqual(['weight', 'steps']);
  });

  it('detects access withdrawn in system settings', () => {
    expect(withdrawnTypes(granted, { ...granted, weight: 'denied' })).toEqual(['weight']);
    expect(withdrawnTypes(null, granted)).toEqual([]);
  });
});

describe('runHealthSync', () => {
  it('reads every granted type over the retention window and normalises it', async () => {
    const reader = fakeReader();
    const out = await runHealthSync({
      reader,
      wanted: ALL,
      previous: EMPTY_HEALTH_DATA,
      previousPermissions: null,
      now: NOW,
    });
    expect(out.data.weights).toEqual([
      expect.objectContaining({ weightKg: 70.4, source: 'health_connect', date: '2026-09-29' }),
    ]);
    expect(out.data.steps).toEqual([{ date: '2026-09-30', value: 4200 }]);
    expect(out.data.activeKcal).toEqual([{ date: '2026-09-30', value: 180 }]);
    expect(out.failed).toEqual([]);
    const from = new Date(2026, 8, 30 - (HEALTH_RETENTION_DAYS - 1));
    expect(reader.calls).toContain(`weight:${from.toISOString()}`);
  });

  it('handles "no data" as empty, not as an error', async () => {
    const none = () => ok([]);
    const reader = fakeReader({ getWeight: none, getSteps: none, getActiveCalories: none, getWorkouts: none });
    const out = await runHealthSync({
      reader,
      wanted: ALL,
      previous: previousData,
      previousPermissions: granted,
      now: NOW,
    });
    expect(out.data).toEqual(EMPTY_HEALTH_DATA);
  });

  it('reads nothing and changes nothing when the platform has no health store', async () => {
    const reader = fakeReader({ getAvailability: () => Promise.resolve('not_installed') });
    const out = await runHealthSync({
      reader,
      wanted: ALL,
      previous: previousData,
      previousPermissions: granted,
      now: NOW,
    });
    expect(out.availability).toBe('not_installed');
    expect(out.data).toBe(previousData);
    expect(reader.calls).toEqual([]);
  });

  it('reads nothing when every permission is refused', async () => {
    const denied: HealthPermissions = {
      weight: 'denied',
      steps: 'denied',
      workouts: 'denied',
      activeCalories: 'denied',
    };
    const reader = fakeReader({ getPermissions: () => ok(denied) });
    const out = await runHealthSync({
      reader,
      wanted: ALL,
      previous: EMPTY_HEALTH_DATA,
      previousPermissions: null,
      now: NOW,
    });
    expect(reader.calls).toEqual([]);
    expect(out.data).toEqual(EMPTY_HEALTH_DATA);
  });

  it('removes the data of a permission revoked later, keeps the others', async () => {
    const reader = fakeReader({ getPermissions: () => ok({ ...granted, weight: 'denied' }) });
    const out = await runHealthSync({
      reader,
      wanted: ALL,
      previous: previousData,
      previousPermissions: granted,
      now: NOW,
    });
    expect(out.withdrawn).toEqual(['weight']);
    expect(out.data.weights).toEqual([]);
    expect(out.data.steps).toEqual([{ date: '2026-09-30', value: 4200 }]);
    expect(reader.calls.some((c) => c.startsWith('weight'))).toBe(false);
  });

  it('removes a type the user stopped sharing', async () => {
    const out = await runHealthSync({
      reader: fakeReader(),
      wanted: ['steps'],
      previous: previousData,
      previousPermissions: granted,
      now: NOW,
    });
    expect(out.data.weights).toEqual([]);
    expect(out.data.activeKcal).toEqual([]);
    expect(out.data.steps).toEqual([{ date: '2026-09-30', value: 4200 }]);
  });

  it('keeps the previous values of a type that failed to read (retry later)', async () => {
    const reader = fakeReader({ getSteps: () => Promise.resolve({ status: 'error', retryable: true }) });
    const out = await runHealthSync({
      reader,
      wanted: ALL,
      previous: previousData,
      previousPermissions: granted,
      now: NOW,
    });
    expect(out.failed).toEqual(['steps']);
    expect(out.data.steps).toEqual(previousData.steps);
  });

  it('keeps everything when permissions cannot be read', async () => {
    const reader = fakeReader({ getPermissions: () => Promise.resolve({ status: 'error', retryable: true }) });
    const out = await runHealthSync({
      reader,
      wanted: ALL,
      previous: previousData,
      previousPermissions: granted,
      now: NOW,
    });
    expect(out.data).toBe(previousData);
    expect(out.failed).toEqual(ALL);
  });

  it('reflects a sample deleted in the health app', async () => {
    const out = await runHealthSync({
      reader: fakeReader({ getWeight: () => ok([]) }),
      wanted: ALL,
      previous: previousData,
      previousPermissions: granted,
      now: NOW,
    });
    expect(out.data.weights).toEqual([]);
  });

  it('drops data older than the retention window', async () => {
    const old = { ...previousData, steps: [{ date: '2026-08-01', value: 5000 }] };
    const reader = fakeReader({ getSteps: () => Promise.resolve({ status: 'error', retryable: true }) });
    const out = await runHealthSync({ reader, wanted: ALL, previous: old, previousPermissions: granted, now: NOW });
    expect(out.data.steps).toEqual([]);
  });

  it('counts rejected samples', async () => {
    const reader = fakeReader({ getWeight: () => ok([{ id: 'x', at: NOW.toISOString(), value: 700, unit: 'kg' }]) });
    const out = await runHealthSync({
      reader,
      wanted: ['weight'],
      previous: EMPTY_HEALTH_DATA,
      previousPermissions: null,
      now: NOW,
    });
    expect(out.rejected).toBe(1);
    expect(out.data.weights).toEqual([]);
  });
});
