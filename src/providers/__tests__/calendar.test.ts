import * as Calendar from 'expo-calendar/legacy';

import { deviceCalendarProvider as provider } from '../calendar';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  };
});

jest.mock('expo-calendar/legacy', () => {
  const events: Record<string, { calendarId: string }> = {
    personal: { calendarId: 'work' },
  };
  return {
    EntityTypes: { EVENT: 'event' },
    SourceType: { LOCAL: 'local' },
    CalendarAccessLevel: { OWNER: 'owner' },
    Availability: { FREE: 'free', BUSY: 'busy' },
    EventStatus: { CANCELED: 'canceled' },
    __events: events,
    getCalendarPermissionsAsync: jest.fn(async () => ({ granted: true })),
    requestCalendarPermissionsAsync: jest.fn(async () => ({ granted: true })),
    getCalendarsAsync: jest.fn(async () => [{ id: 'work' }, ...(events.__app ? [{ id: 'app' }] : [])]),
    getDefaultCalendarAsync: jest.fn(async () => ({ source: { id: 'src', name: 'iCloud' } })),
    createCalendarAsync: jest.fn(async () => {
      events.__app = { calendarId: 'app' };
      return 'app';
    }),
    getEventsAsync: jest.fn(async () => [
      {
        startDate: '2026-09-29T16:00:00.000Z',
        endDate: '2026-09-29T17:00:00.000Z',
        allDay: false,
        title: 'Médecin',
        availability: 'busy',
      },
      {
        startDate: '2026-09-29T18:00:00.000Z',
        endDate: '2026-09-29T19:00:00.000Z',
        allDay: false,
        title: 'Libre',
        availability: 'free',
      },
    ]),
    getEventAsync: jest.fn(async (id: string) => {
      if (!events[id]) throw new Error('not found');
      return events[id];
    }),
    createEventAsync: jest.fn(async (calendarId: string) => {
      events.e1 = { calendarId };
      return 'e1';
    }),
    updateEventAsync: jest.fn(async () => 'ok'),
    deleteEventAsync: jest.fn(async () => undefined),
    deleteCalendarAsync: jest.fn(async () => undefined),
  };
});

const input = { title: 'Séance', start: new Date(2026, 8, 29, 7), end: new Date(2026, 8, 29, 8) };

describe('device calendar provider', () => {
  it('reads busy times only, without titles, skipping free events', async () => {
    const r = await provider.busyEvents(new Date(2026, 8, 28), new Date(2026, 9, 5));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.data).toEqual([{ start: '2026-09-29T16:00:00.000Z', end: '2026-09-29T17:00:00.000Z', allDay: false }]);
      expect(JSON.stringify(r.data)).not.toContain('Médecin');
    }
  });

  it('writes in its own calendar and refuses to touch personal events', async () => {
    const created = await provider.createAppEvent(input);
    expect(created).toMatchObject({ status: 'ok', data: 'e1' });
    expect(Calendar.createEventAsync).toHaveBeenCalledWith('app', expect.objectContaining({ title: 'Séance' }));

    expect(await provider.updateAppEvent('e1', input)).toMatchObject({ status: 'ok' });
    expect(await provider.updateAppEvent('personal', input)).toEqual({
      status: 'unavailable',
      reason: 'permission_denied',
    });
    expect(await provider.deleteAppEvent('personal')).toEqual({ status: 'unavailable', reason: 'permission_denied' });
    expect(Calendar.updateEventAsync).toHaveBeenCalledTimes(1);
    expect(Calendar.deleteEventAsync).not.toHaveBeenCalled();

    expect(await provider.deleteAppEvent('e1')).toMatchObject({ status: 'ok' });
  });

  it('disconnect removes the app calendar only', async () => {
    expect(await provider.disconnect()).toMatchObject({ status: 'ok' });
    expect(Calendar.deleteCalendarAsync).toHaveBeenCalledWith('app');
    expect(Calendar.deleteCalendarAsync).toHaveBeenCalledTimes(1);
  });

  it('reports a refused permission instead of failing', async () => {
    (Calendar.getCalendarPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    expect(await provider.busyEvents(new Date(), new Date())).toEqual({
      status: 'unavailable',
      reason: 'permission_denied',
    });
  });
});
