import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { pickMealPhoto } from '../mealPhoto';

jest.mock('expo-image-picker', () => ({
  CameraType: { back: 'back', front: 'front' },
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'blob:x', width: 4000, height: 3000 }] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: jest.fn(),
      renderAsync: async () => ({ saveAsync: async () => ({ uri: 'blob:small', base64: 'QUJD' }) }),
    }),
  },
}));

const picker = jest.mocked(ImagePicker);

describe('pickMealPhoto', () => {
  const os = Platform.OS;
  afterEach(() => {
    Platform.OS = os;
    jest.clearAllMocks();
  });

  it('phone app: asks the camera permission at the tap, refusal keeps the other paths', async () => {
    Platform.OS = 'ios';
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false } as never);
    expect(await pickMealPhoto('camera')).toEqual({ status: 'denied' });
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('web: opens the back camera through the file field straight from the tap (no permission step)', async () => {
    Platform.OS = 'web';
    const result = await pickMealPhoto('camera');
    expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(picker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ cameraType: 'back' }));
    expect(result).toEqual({ status: 'ok', uri: 'blob:small', photo: { base64: 'QUJD', mediaType: 'image/jpeg' } });
  });

  it('closing the picker is a cancel, not an error', async () => {
    Platform.OS = 'web';
    expect(await pickMealPhoto('library')).toEqual({ status: 'cancelled' });
  });
});
