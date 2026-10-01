import { useState } from 'react';
import { Platform } from 'react-native';

import { providers } from '@/providers';
import { useCalendarStore } from '@/state/calendar';

export const calendarSupported = Platform.OS !== 'web';

/** Connect / disconnect the device calendar. Disconnecting removes every event the app wrote. */
export function useCalendarLink() {
  const state = useCalendarStore();
  const [pending, setPending] = useState(false);

  const connect = async () => {
    setPending(true);
    const result = await providers.calendar.requestAccess();
    if (result.status === 'ok') state.connect();
    else
      state.update({
        status:
          result.status === 'unavailable'
            ? result.reason === 'not_supported_on_platform'
              ? 'unsupported'
              : 'denied'
            : 'error',
      });
    setPending(false);
  };

  const disconnect = async () => {
    setPending(true);
    const result = await providers.calendar.disconnect();
    setPending(false);
    if (result.status === 'error') {
      state.update({ status: 'error' });
      return false;
    }
    state.reset();
    return true;
  };

  return { ...state, pending, connect, disconnect };
}
