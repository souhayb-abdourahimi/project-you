import * as HealthKit from '@kingstinct/react-native-healthkit';
import * as HC from 'react-native-health-connect';

import { runHealthSync } from '@/domain/health/sync';
import { EMPTY_HEALTH_DATA } from '@/domain/health/types';

import { deviceHealthProvider as android } from '../health.android';
import { deviceHealthProvider as ios } from '../health.ios';
import { deviceHealthProvider as web } from '../health.unsupported';

// Platform mocks come from jest.setup.js; each test sets what the "device" returns.
const hk = HealthKit as jest.Mocked<typeof HealthKit>;
const hc = HC as jest.Mocked<typeof HC>;

const NOW = new Date(2026, 8, 30, 12, 0);
const RANGE = { from: new Date(2026, 8, 3), to: NOW };
const ALL = ['weight', 'steps', 'workouts', 'activeCalories'] as const;

beforeEach(() => jest.clearAllMocks());

describe('web', () => {
  it('has no health store and reads nothing', async () => {
    expect(web.source).toBeNull();
    expect(await web.getAvailability()).toBe('not_supported');
    expect(await web.getSteps(RANGE)).toEqual({ status: 'unavailable', reason: 'not_supported_on_platform' });
    expect(await web.requestPermissions([...ALL])).toMatchObject({ status: 'unavailable' });
  });
});

describe('Apple Health (HealthKit)', () => {
  it('reports unavailability (e.g. iPad without Health)', async () => {
    hk.isHealthDataAvailableAsync.mockResolvedValueOnce(false);
    expect(await ios.getAvailability()).toBe('unavailable');
  });

  it('asks read access only, for the chosen types only', async () => {
    hk.getRequestStatusForAuthorization.mockResolvedValue(HealthKit.AuthorizationRequestStatus.unnecessary);
    const result = await ios.requestPermissions(['weight', 'steps']);
    expect(hk.requestAuthorization).toHaveBeenCalledWith({
      toRead: ['HKQuantityTypeIdentifierBodyMass', 'HKQuantityTypeIdentifierStepCount'],
    });
    expect(hk.requestAuthorization.mock.calls[0][0]).not.toHaveProperty('toShare');
    // Apple never reveals a refusal: asked types are "requested", the others untouched.
    expect(result).toMatchObject({
      status: 'ok',
      data: { weight: 'requested', steps: 'requested', workouts: 'not_determined', activeCalories: 'not_determined' },
      meta: { provider: 'apple-health', isMock: false },
    });
  });

  it('maps samples, daily statistics and workouts', async () => {
    hk.queryQuantitySamples.mockResolvedValueOnce([
      { uuid: 'u1', startDate: new Date(2026, 8, 29, 7), quantity: 70.2, unit: 'kg' },
    ] as never);
    hk.queryStatisticsCollectionForQuantity.mockResolvedValueOnce([
      { startDate: new Date(2026, 8, 29), sumQuantity: { quantity: 8123, unit: 'count' }, sources: [] },
      { startDate: new Date(2026, 8, 30), sources: [] },
    ] as never);
    hk.queryWorkoutSamples.mockResolvedValueOnce([
      {
        uuid: 'w1',
        startDate: new Date(2026, 8, 29, 18),
        endDate: new Date(2026, 8, 29, 18, 40),
        workoutActivityType: 37,
        totalEnergyBurned: { quantity: 320, unit: 'kcal' },
      },
    ] as never);
    expect(await ios.getWeight(RANGE)).toMatchObject({
      status: 'ok',
      data: [{ id: 'u1', value: 70.2, unit: 'kg', at: new Date(2026, 8, 29, 7).toISOString() }],
    });
    expect(await ios.getSteps(RANGE)).toMatchObject({ data: [{ date: '2026-09-29', value: 8123, unit: 'count' }] });
    expect(await ios.getWorkouts(RANGE)).toMatchObject({
      data: [{ id: 'w1', activityCode: 37, activeEnergy: { value: 320, unit: 'kcal' } }],
    });
  });

  it('turns a native exception into a retryable error without details', async () => {
    hk.queryQuantitySamples.mockRejectedValueOnce(new Error('Protected health data is inaccessible'));
    expect(await ios.getWeight(RANGE)).toEqual({ status: 'error', error: 'unknown', retryable: true });
  });

  it('cannot revoke on iOS: disconnect is logical only', async () => {
    expect(await ios.disconnect()).toMatchObject({ status: 'ok', data: { revokedBySystem: false } });
  });
});

describe('Health Connect', () => {
  const read = (recordType: string) => ({ accessType: 'read' as const, recordType }) as never;

  it('maps SDK status to availability', async () => {
    hc.getSdkStatus.mockResolvedValueOnce(3);
    expect(await android.getAvailability()).toBe('available');
    hc.getSdkStatus.mockResolvedValueOnce(2);
    expect(await android.getAvailability()).toBe('update_required');
    hc.getSdkStatus.mockResolvedValueOnce(1);
    expect(await android.getAvailability()).toBe('not_installed');
    hc.getSdkStatus.mockRejectedValueOnce(new Error('no provider'));
    expect(await android.getAvailability()).toBe('not_installed');
  });

  it('requests read permissions only and reports partial grants', async () => {
    hc.requestPermission.mockResolvedValueOnce([read('Steps'), read('Weight')]);
    const result = await android.requestPermissions([...ALL]);
    expect(hc.requestPermission).toHaveBeenCalledWith([
      { accessType: 'read', recordType: 'Weight' },
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    ]);
    expect(result).toMatchObject({
      status: 'ok',
      data: { weight: 'granted', steps: 'granted', workouts: 'denied', activeCalories: 'denied' },
    });
  });

  it('checks the permission at read time and reads nothing once revoked', async () => {
    hc.getGrantedPermissions.mockResolvedValue([]);
    expect(await android.getWeight(RANGE)).toEqual({ status: 'unavailable', reason: 'permission_denied' });
    expect(hc.readRecords).not.toHaveBeenCalled();
  });

  it('reads every page of weights in kilograms', async () => {
    hc.getGrantedPermissions.mockResolvedValue([read('Weight')]);
    hc.readRecords
      .mockResolvedValueOnce({
        records: [{ time: '2026-09-28T06:00:00Z', weight: { inKilograms: 70.1 }, metadata: { id: 'a' } }],
        pageToken: 'next',
      } as never)
      .mockResolvedValueOnce({
        records: [{ time: '2026-09-29T06:00:00Z', weight: { inKilograms: 70.3 }, metadata: { id: 'b' } }],
      } as never);
    const result = await android.getWeight(RANGE);
    expect(hc.readRecords).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: 'ok',
      data: [
        { id: 'a', value: 70.1, unit: 'kg' },
        { id: 'b', value: 70.3 },
      ],
    });
  });

  it('uses daily aggregates for steps (local days)', async () => {
    hc.getGrantedPermissions.mockResolvedValue([read('Steps')]);
    hc.aggregateGroupByPeriod.mockResolvedValueOnce([
      { startTime: '2026-09-29T00:00', endTime: '2026-09-30T00:00', result: { COUNT_TOTAL: 6400, dataOrigins: [] } },
    ] as never);
    expect(await android.getSteps(RANGE)).toMatchObject({ data: [{ date: '2026-09-29', value: 6400, unit: 'count' }] });
  });

  it('adds active energy to a workout only when that permission is granted', async () => {
    hc.getGrantedPermissions.mockResolvedValue([read('ExerciseSession')]);
    hc.readRecords.mockResolvedValueOnce({
      records: [
        { startTime: '2026-09-29T17:00:00Z', endTime: '2026-09-29T17:45:00Z', exerciseType: 70, metadata: { id: 's' } },
      ],
    } as never);
    expect(await android.getWorkouts(RANGE)).toMatchObject({
      data: [{ id: 's', activityCode: 70, activeEnergy: null }],
    });
    expect(hc.aggregateRecord).not.toHaveBeenCalled();
  });

  it('revokes on disconnect', async () => {
    expect(await android.disconnect()).toMatchObject({ status: 'ok', data: { revokedBySystem: true } });
    expect(hc.revokeAllPermissions).toHaveBeenCalled();
  });

  it('feeds the sync engine end to end: refusal of some types, others imported', async () => {
    hc.getSdkStatus.mockResolvedValue(3);
    hc.getGrantedPermissions.mockResolvedValue([read('Steps')]);
    hc.aggregateGroupByPeriod.mockResolvedValue([
      { startTime: '2026-09-30T00:00', endTime: '2026-10-01T00:00', result: { COUNT_TOTAL: 3000, dataOrigins: [] } },
    ] as never);
    const out = await runHealthSync({
      reader: android,
      wanted: [...ALL],
      previous: EMPTY_HEALTH_DATA,
      previousPermissions: null,
      now: NOW,
    });
    expect(out.permissions).toMatchObject({ steps: 'granted', weight: 'denied' });
    expect(out.data.steps).toEqual([{ date: '2026-09-30', value: 3000 }]);
    expect(out.data.weights).toEqual([]);
  });
});
