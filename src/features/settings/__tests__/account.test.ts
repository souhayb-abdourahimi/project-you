/**
 * Signing out (D-043): this device is cleared (D-015), so what is not sent yet is sent first; when
 * something still waits, nothing is cleared until the user decides.
 */
import { act, renderHook } from '@testing-library/react-native';

import { useAccount } from '../useAccount';

const mockSyncNow = jest.fn();
const mockPending = jest.fn();
const mockSignOut = jest.fn();
const mockReset = jest.fn();
const mockReplace = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn() } }));
jest.mock('@/hooks/useSync', () => ({ syncNow: () => mockSyncNow(), pendingChanges: () => mockPending() }));
jest.mock('@/hooks/deviceData', () => ({ resetDeviceData: () => mockReset() }));
jest.mock('@/services/auth', () => ({
  signOut: () => mockSignOut(),
  useSession: () => ({ session: { user: { email: 'sam@example.test' } } }),
}));

beforeEach(() => jest.clearAllMocks());

describe('sign out', () => {
  it('sends pending changes, then clears this device', async () => {
    mockPending.mockReturnValue(0);
    const { result } = await renderHook(() => useAccount());
    await act(() => result.current.requestSignOut());
    expect(mockSyncNow).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('stops and says how many changes wait; nothing is cleared until the user confirms', async () => {
    mockPending.mockReturnValue(3);
    const { result } = await renderHook(() => useAccount());
    await act(() => result.current.requestSignOut());
    expect(result.current.signOutState).toEqual({ kind: 'pending', count: 3 });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
    await act(() => result.current.requestSignOut(true));
    expect(mockReset).toHaveBeenCalled();
  });

  it('a failed sign-out keeps everything on this device', async () => {
    mockPending.mockReturnValue(0);
    mockSignOut.mockRejectedValueOnce(new Error('network'));
    const { result } = await renderHook(() => useAccount());
    await act(() => result.current.requestSignOut());
    expect(result.current.signOutState).toEqual({ kind: 'failed' });
    expect(mockReset).not.toHaveBeenCalled();
  });
});
