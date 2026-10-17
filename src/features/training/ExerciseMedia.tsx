import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui';
import { gradients, gradientStyle, motion, radius, useColors, useReducedMotion } from '@/theme';

import { exerciseMedia } from './exerciseMedia';

/**
 * The picture of an exercise: its validated media (`exercise.id -> media`, exerciseMedia.ts), else
 * a calm drawn artwork. `thumb` for lists and alternatives, `hero` above the exercise in progress.
 * Named for screen readers only when it is a real photo; the artwork is decorative.
 */
export function ExerciseMedia({
  exerciseId,
  label,
  variant = 'thumb',
  size = 52,
}: {
  exerciseId: string;
  label: string;
  variant?: 'thumb' | 'hero';
  size?: number;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const source = exerciseMedia(exerciseId);
  const photo = source && !failed ? source : null;
  const hero = variant === 'hero';
  return (
    <View
      accessibilityRole={photo ? 'image' : undefined}
      accessibilityLabel={photo ? label : undefined}
      accessibilityElementsHidden={!photo}
      importantForAccessibility={photo ? 'auto' : 'no-hide-descendants'}
      style={[
        hero ? styles.hero : [styles.thumb, { width: size, height: size }],
        { backgroundColor: hero ? colors.inverse : colors.surfaceSubtle },
      ]}>
      {photo ? (
        <Image
          source={photo}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={reduced ? 0 : motion.slow}
          onError={() => setFailed(true)}
        />
      ) : hero ? (
        <>
          <View style={[StyleSheet.absoluteFill, gradientStyle(gradients.heroGlow)]} />
          <View style={[styles.ring, styles.ringLarge, { borderColor: colors.inverseFill }]} />
          <View style={[styles.ring, styles.ringSmall, { borderColor: colors.inverseFill }]} />
          <View style={styles.glyph}>
            <Icon name="workout" size={96} color="onInverse" />
          </View>
        </>
      ) : (
        <View style={styles.centre}>
          <Icon name="workout" size={Math.round(size * 0.42)} color="training" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: radius.md, overflow: 'hidden' },
  hero: { height: 168, borderRadius: radius.lg, overflow: 'hidden' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5, borderRadius: radius.pill },
  ringLarge: { width: 260, height: 260, top: -80, right: -70 },
  ringSmall: { width: 160, height: 160, top: -20, right: -10 },
  glyph: { position: 'absolute', bottom: 18, left: 20, opacity: 0.22 },
});
