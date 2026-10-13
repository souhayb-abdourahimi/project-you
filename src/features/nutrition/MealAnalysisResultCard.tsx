import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components/ui';
import { radius, spacing, useColors } from '@/theme';

import type { MealAnalysisResult } from './mealAnalysis';

export function MealAnalysisResultCard({
  result,
  onConfirm,
  confirming,
}: {
  result: MealAnalysisResult;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  const colors = useColors();
  const confidence =
    result.confidence === null ? null : Math.max(0, Math.min(100, Math.round(result.confidence * 100)));

  return (
    <View style={styles.root}>
      <View style={[styles.photo, { backgroundColor: colors.inverse }]}>
        <Image source={{ uri: result.imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      </View>

      <Card raised style={styles.card}>
        <View style={styles.heading}>
          <View style={[styles.iconWell, { backgroundColor: colors.primarySubtle }]}>
            <Icon name="meal" size="md" color="nutrition" />
          </View>
          <View style={styles.flex}>
            <Text variant="overline" color="nutrition">
              ESTIMATION
            </Text>
            <Text variant="title3">Notre IA estime</Text>
            <Text variant="caption" color="textMuted">
              Vérifie les aliments et les portions avant d’ajouter le repas.
            </Text>
          </View>
        </View>

        <View style={styles.items}>
          {result.items.map((item) => (
            <View key={item.id} style={styles.item}>
              <View style={styles.flex}>
                <Text variant="bodyMedium">{item.name}</Text>
                <Text variant="caption" color="textMuted">
                  {item.grams === null ? 'Portion à confirmer' : `${Math.round(item.grams)} g`}
                </Text>
              </View>
              {item.confidence !== null ? (
                <Text variant="captionStrong" color="textMuted">
                  {Math.round(Math.max(0, Math.min(1, item.confidence)) * 100)}%
                </Text>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.macros}>
          <Metric label="kcal" value={String(Math.round(result.nutrition.kcal))} />
          <Metric label="Protéines" value={`${Math.round(result.nutrition.proteinG)} g`} />
          <Metric label="Glucides" value={`${Math.round(result.nutrition.carbsG)} g`} />
          <Metric label="Lipides" value={`${Math.round(result.nutrition.fatG)} g`} />
        </View>

        {confidence !== null ? (
          <Text variant="caption" color="textMuted">
            Confiance globale de l’analyse : {confidence}%. Cette estimation doit être confirmée.
          </Text>
        ) : (
          <Text variant="caption" color="textMuted">
            Les valeurs sont estimées à partir de la photo et doivent être confirmées.
          </Text>
        )}

        <Button
          block
          label="Confirmer et ajouter"
          loading={confirming}
          onPress={onConfirm}
          accessibilityHint="Ajoute le repas uniquement après ta confirmation."
        />
      </Card>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.metric, { backgroundColor: colors.surfaceSubtle }]}>
      <Text variant="captionStrong">{value}</Text>
      <Text variant="micro" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  photo: {
    height: 260,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  card: { gap: spacing.lg },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  items: { gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  macros: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  metric: {
    flex: 1,
    minWidth: 76,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 2,
  },
  flex: { flex: 1 },
});
