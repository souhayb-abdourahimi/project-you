import { useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';

/**
 * One rule for every form of Réglages (D-043, §28): nothing is saved before "Enregistrer"; leaving
 * with changes not saved asks first (the browser's dialog on the web, an alert on iOS / Android).
 */
export function useUnsavedGuard(dirty: boolean, text: { title: string; message: string; leave: string; stay: string }) {
  const navigation = useNavigation();
  useEffect(() => {
    if (!dirty) return;
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      const leave = () => navigation.dispatch(e.data.action);
      if (Platform.OS === 'web') {
        if (globalThis.confirm?.(`${text.title}\n${text.message}`)) leave();
        return;
      }
      Alert.alert(text.title, text.message, [
        { text: text.stay, style: 'cancel' },
        { text: text.leave, style: 'destructive', onPress: leave },
      ]);
    });
  }, [dirty, navigation, text.title, text.message, text.leave, text.stay]);
}
