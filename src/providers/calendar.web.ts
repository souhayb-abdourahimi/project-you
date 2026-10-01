import type { CalendarProvider } from './types';

const notSupported = async () => ({ status: 'unavailable', reason: 'not_supported_on_platform' }) as const;

/** No device calendar on the web: every call says so instead of pretending. */
export const deviceCalendarProvider: CalendarProvider = {
  requestAccess: notSupported,
  busyEvents: notSupported,
  createAppEvent: notSupported,
  updateAppEvent: notSupported,
  deleteAppEvent: notSupported,
  disconnect: notSupported,
};
