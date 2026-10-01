import type { HealthSource } from '@/domain/health/types';

import type { ProviderResult } from './types';

const PROVIDER: Record<HealthSource, { provider: string; source: string }> = {
  healthkit: { provider: 'apple-health', source: 'Apple Health (HealthKit)' },
  health_connect: { provider: 'health-connect', source: 'Health Connect' },
};

export function healthOk<T>(origin: HealthSource, data: T): ProviderResult<T> {
  return {
    status: 'ok',
    data,
    meta: {
      ...PROVIDER[origin],
      externalId: null,
      fetchedAt: new Date().toISOString(),
      updatedAt: null,
      // Values measured or entered by the user's own devices and apps.
      confidence: 'high',
      isMock: false,
    },
  };
}

export const healthFailed = { status: 'error', error: 'unknown', retryable: true } as const;
export const healthDenied = { status: 'unavailable', reason: 'permission_denied' } as const;

/** Runs a native call; any exception becomes a retryable error (no message: it could hold data). */
export async function guarded<T>(run: () => Promise<ProviderResult<T>>): Promise<ProviderResult<T>> {
  try {
    return await run();
  } catch {
    return healthFailed;
  }
}
