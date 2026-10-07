import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { gradients, gradientStyle, motion, useColors, useReducedMotion } from '@/theme';

import { Icon, type IconName } from './Icon';

/**
 * The visual behind a hero card (W-9 §3.1). Source priority: a real media of the session or the
 * exercise (`media_url`), then a media of the Project You library, else a drawn artwork (soft
 * light + the session's symbol). Never a random web photo: without a real media the artwork is
 * shown, and a media that fails to load falls back to it. Decorative for screen readers.
 */
export function HeroMedia({ uri, icon }: { uri?: string | null; icon: IconName }) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const photo = uri && !failed ? uri : null;
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.inverse }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none">
      {photo ? (
        <>
          <Image
            source={{ uri: photo }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={reduced ? 0 : motion.slow}
            onError={() => setFailed(true)}
          />
          <View style={[StyleSheet.absoluteFill, gradientStyle(gradients.heroScrim)]} />
        </>
      ) : (
        <>
          <View style={[StyleSheet.absoluteFill, gradientStyle(gradients.heroGlow)]} />
          <View style={[styles.ring, styles.ringLarge, { borderColor: colors.inverseFill }]} />
          <View style={[styles.ring, styles.ringSmall, { borderColor: colors.inverseFill }]} />
          <View style={styles.glyph}>
            <Icon name={icon} size={150} color="onInverse" />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 1.5, borderRadius: 999 },
  ringLarge: { width: 300, height: 300, top: -90, right: -110 },
  ringSmall: { width: 190, height: 190, top: -30, right: -50 },
  glyph: { position: 'absolute', top: 6, right: 6, opacity: 0.14, transform: [{ rotate: '-12deg' }] },
});
