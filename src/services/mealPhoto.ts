import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { MealPhoto } from '@/providers/types';

/** Longest side sent to the analysis: enough to recognise foods, small enough to stay fast and cheap. */
export const MEAL_PHOTO_MAX_SIDE = 1024;
const JPEG_QUALITY = 0.6;
/** Mirrors the Edge Function limit (≈ 1.5 MB of JPEG in base64). */
const MAX_BASE64 = 2_000_000;

export type MealPhotoPick =
  | { status: 'ok'; uri: string; photo: MealPhoto }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'too_large' }
  | { status: 'failed' };

/**
 * Takes or picks one meal photo, only after the user's tap. The camera permission is asked at that
 * moment (refusal keeps the library and the manual composition). The image is resized and
 * compressed on the device; nothing is uploaded here and nothing is stored by the app.
 */
export async function pickMealPhoto(source: 'camera' | 'library'): Promise<MealPhotoPick> {
  try {
    // Web: the browser's file field needs no permission, and must open within the tap (iOS Safari).
    if (source === 'camera' && Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return { status: 'denied' };
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
      // Back camera; on the web this is the file field's capture="environment".
      cameraType: ImagePicker.CameraType.back,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return { status: 'cancelled' };
    const asset = result.assets[0];
    const landscape = (asset.width ?? 0) >= (asset.height ?? 0);
    const context = ImageManipulator.manipulate(asset.uri);
    context.resize(landscape ? { width: MEAL_PHOTO_MAX_SIDE } : { height: MEAL_PHOTO_MAX_SIDE });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG, base64: true });
    const base64 = (saved.base64 ?? '').replace(/^data:image\/\w+;base64,/, '');
    if (!base64) return { status: 'failed' };
    if (base64.length > MAX_BASE64) return { status: 'too_large' };
    return { status: 'ok', uri: saved.uri, photo: { base64, mediaType: 'image/jpeg' } };
  } catch {
    return { status: 'failed' };
  }
}
