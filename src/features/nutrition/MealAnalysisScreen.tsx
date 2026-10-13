import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Icon, ScreenHeader, Skeleton, Text } from '@/components/ui';
import { radius, spacing, useColors } from '@/theme';

import { MealAnalysisResultCard } from './MealAnalysisResultCard';
import { isUsableMealAnalysis, type MealAnalysisResult, type MealAnalysisStatus } from './mealAnalysis';

export function MealAnalysisScreen({
  status,
  imageUri,
  result,
  onChoosePhoto,
  onRetry,
  onConfirm,
  confirming,
}: {
  status: MealAnalysisStatus;
  imageUri?: string | null;
  result?: MealAnalysisResult | null;
  onChoosePhoto: () => void;
  onRetry: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  const colors = useColors();

  return (
    <View style={styles.root}>
      <ScreenHeader title="Analyser le repas" subtitle="Photo du repas" />

      {status === 'idle' ? (
        <EmptyState
          icon="meal"
          title="Ajoute une photo de ton repas"
          message="L’analyse ne démarre qu’après ton choix de photo. Aucune valeur nutritionnelle n’est devinée avant l’analyse."
          action={<Button block label="Choisir une photo" onPress={onChoosePhoto} />}
        />
      ) : null}

      {status === 'analyzing' ? (
        <Card raised style={styles.loadingCard} accessibilityLabel="Analyse du repas en cours">
          {imageUri ? (
            <View style={[styles.photo, { backgroundColor: colors.inverse }]}>
              <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </View>
          ) : (
            <Skeleton height={240} />
          )}
          <View style={styles.loadingTitle}>
            <View style={[styles.iconWell, { backgroundColor: colors.primarySubtle }]}>
              <Icon name="meal" size="md" color="nutrition" />
            </View>
            <View style={styles.flex}>
              <Text variant="title3">Analyse en cours</Text>
              <Text variant="caption" color="textMuted">
                Identification des aliments et estimation des portions.
              </Text>
            </View>
          </View>
          <Skeleton height={18} width="85%" />
          <Skeleton height={18} width="65%" />
          <Skeleton height={72} />
        </Card>
      ) : null}

      {status === 'ready' && isUsableMealAnalysis(result) ? (
        <MealAnalysisResultCard result={result} onConfirm={onConfirm} confirming={confirming} />
      ) : null}

      {status === 'ready' && !isUsableMealAnalysis(result) ? (
        <EmptyState
          icon="info"
          title="Analyse incomplète"
          message="Le résultat reçu ne contient pas assez d’informations fiables pour calculer ce repas. Rien n’a été ajouté."
          action={<Button block variant="secondary" label="Réessayer" onPress={onRetry} />}
        />
      ) : null}

      {status === 'error' ? (
        <EmptyState
          icon="info"
          title="Analyse indisponible"
          message="La photo n’a pas pu être analysée. Aucun aliment, calorie ou macro n’a été enregistré."
          action={<Button block variant="secondary" label="Réessayer" onPress={onRetry} />}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xl },
  loadingCard: { gap: spacing.lg },
  loadingTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photo: {
    height: 240,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
