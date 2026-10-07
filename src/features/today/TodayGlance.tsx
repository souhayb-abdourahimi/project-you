import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Icon, MiniBars, ProgressRing, Text } from '@/components/ui';
import { fromKg } from '@/domain/settings/units';
import type { Journey } from '@/hooks/useJourney';
import { useMassUnit } from '@/hooks/useMassUnit';
import type { Plan } from '@/hooks/usePlan';
import { formatNumber } from '@/lib/format';
import { useHealthStore } from '@/state/health';
import { PRESSED_SCALE, borderWidth, radius, spacing, useColors } from '@/theme';

import { todayGlance, type TodayGlance as Glance, type WeekDayState } from './view';

/**
 * The glance of Today (W-9 §3.1): one nutrition ring, the week as a strip, and steps with a small
 * chart (or the recent weight). Real values only; every visual has its value in words.
 */
export function TodayGlance({ plan, journey }: { plan: Plan; journey: Journey }) {
  const sharing = useHealthStore((s) => s.connected && s.wanted.includes('steps'));
  const steps = useHealthStore((s) => s.data.steps);
  const glance = todayGlance({
    today: plan.today,
    week: journey.trainingWeek,
    meals: plan.mealPlan?.days.find((d) => d.date === plan.today)?.meals ?? null,
    proteinTargetG: plan.targets.proteinG,
    kcalTarget: plan.targets.calories,
    steps: sharing ? steps : null,
    weight: journey.progress.body.weight,
    bodyOrder: journey.progress.bodyOrder,
  });
  const side = glance.steps ? <Steps steps={glance.steps} /> : glance.weight ? <Weight weight={glance.weight} /> : null;
  if (!glance.nutrition && !glance.week && !side) return null;
  return (
    <View style={styles.glance}>
      {glance.nutrition ? <Nutrition n={glance.nutrition} /> : null}
      {glance.week || side ? (
        <View style={styles.row}>
          {glance.week ? <Week week={glance.week} /> : null}
          {side}
        </View>
      ) : null}
    </View>
  );
}

function Nutrition({ n }: { n: NonNullable<Glance['nutrition']> }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const num = (v: number) => formatNumber(v, i18n.language);
  const label = t('today.glance.proteinA11y', { eaten: n.proteinG, target: n.proteinTargetG });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${t('today.glance.energyA11y', { eaten: n.kcal, target: n.kcalTarget })}`}
      accessibilityHint={t('today.glance.openNutrition')}
      onPress={() => router.push('/nutrition')}
      style={({ pressed }) => [styles.pressable, { transform: [{ scale: pressed ? PRESSED_SCALE : 1 }] }]}>
      <Card style={styles.nutrition}>
        <ProgressRing value={n.proteinG / n.proteinTargetG} color="nutrition" label={label} size={104} stroke={10}>
          <Text variant="metric">{num(n.proteinG)}</Text>
          <Text variant="caption" color="textMuted">
            / {num(n.proteinTargetG)} g
          </Text>
        </ProgressRing>
        <View style={styles.flex} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.inline}>
            <Icon name="nutrition" size="sm" color="nutrition" />
            <Text variant="captionStrong" color="textSecondary">
              {t('today.glance.nutrition')}
            </Text>
          </View>
          <Text variant="title3">{t('today.glance.protein')}</Text>
          <Text variant="caption" color="textMuted">
            {t('today.glance.proteinCaption')}
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text variant="caption" color="textSecondary">
            {t('today.glance.energy', { eaten: num(n.kcal), target: num(n.kcalTarget) })}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

function Week({ week }: { week: NonNullable<Glance['week']> }) {
  const { t, i18n } = useTranslation();
  const letter = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'narrow' });
  const describe = week.days
    .filter((d) => d.state !== 'rest')
    .map((d) => `${formatDay(d.date, i18n.language)} : ${t(`today.glance.day.${d.state}`)}`)
    .join(', ');
  return (
    <Card dense style={styles.half} accessibilityLabel={`${t('today.glance.weekA11y', week)}. ${describe}`}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.halfBody}>
        <View style={styles.inline}>
          <Icon name="sessions" size="sm" color="training" />
          <Text variant="captionStrong" color="textSecondary">
            {t('today.glance.week')}
          </Text>
        </View>
        <View style={styles.value}>
          <Text variant="metric">{week.done}</Text>
          <Text variant="captionStrong" color="textMuted">
            / {week.planned} {t('today.glance.sessions')}
          </Text>
        </View>
        <View style={styles.strip}>
          {week.days.map((d) => (
            <View key={d.date} style={styles.day}>
              <Dot state={d.state} />
              <Text variant="micro" color={d.today ? 'primary' : 'textMuted'} style={d.today ? styles.bold : null}>
                {letter.format(new Date(`${d.date}T12:00:00`))}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

/** Done: a filled check. Adapted: a soft fill. Planned: a ring. Not done: grey, never red. */
function Dot({ state }: { state: WeekDayState }) {
  const colors = useColors();
  const look = {
    done: { backgroundColor: colors.success, borderColor: colors.success },
    adapted: { backgroundColor: colors.primarySubtle, borderColor: colors.primary },
    planned: { backgroundColor: colors.surface, borderColor: colors.primary },
    not_done: { backgroundColor: colors.surfaceSubtle, borderColor: colors.borderStrong },
    rest: { backgroundColor: 'transparent', borderColor: 'transparent' },
  }[state];
  return (
    <View style={[styles.dot, look]}>
      {state === 'done' ? <Icon name="check" size={12} color="surface" /> : null}
      {state === 'rest' ? <View style={[styles.restDot, { backgroundColor: colors.borderStrong }]} /> : null}
    </View>
  );
}

function Steps({ steps }: { steps: NonNullable<Glance['steps']> }) {
  const { t, i18n } = useTranslation();
  const value = steps.today === null ? t('today.glance.noValue') : formatNumber(steps.today, i18n.language);
  const known = steps.days?.filter((d): d is number => d !== null) ?? [];
  const chart = steps.days
    ? t('today.glance.stepsChart', {
        days: known.length,
        max: formatNumber(Math.max(...known), i18n.language),
        min: formatNumber(Math.min(...known), i18n.language),
      })
    : '';
  return (
    <Card dense style={styles.half} accessibilityLabel={`${t('today.glance.steps')}, ${value}. ${chart}`}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.halfBody}>
        <View style={styles.inline}>
          <Icon name="steps" size="sm" color="recovery" />
          <Text variant="captionStrong" color="textSecondary">
            {t('today.glance.steps')}
          </Text>
        </View>
        <Text variant="metric">{value}</Text>
        {steps.days ? (
          <MiniBars values={steps.days} label={chart} color="primary" height={36} />
        ) : (
          <Text variant="caption" color="textMuted">
            {t('today.glance.stepsToday')}
          </Text>
        )}
      </View>
    </Card>
  );
}

function Weight({ weight }: { weight: NonNullable<Glance['weight']> }) {
  const { t, i18n } = useTranslation();
  const unit = useMassUnit();
  const num = (kg: number) => formatNumber(fromKg(kg, unit), i18n.language);
  const change =
    weight.changeKg === null
      ? null
      : `${weight.changeKg > 0 ? '+' : weight.changeKg < 0 ? '−' : ''}${num(Math.abs(weight.changeKg))} ${unit}`;
  return (
    <Card
      dense
      style={styles.half}
      accessibilityLabel={[
        `${t('today.glance.weight')}, ${num(weight.kg)} ${unit}, ${t('today.glance.weightCaption')}`,
        change ? t('today.glance.sinceStart', { change }) : null,
      ]
        .filter(Boolean)
        .join('. ')}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.halfBody}>
        <View style={styles.inline}>
          <Icon name="weight" size="sm" color="progress" />
          <Text variant="captionStrong" color="textSecondary">
            {t('today.glance.weight')}
          </Text>
        </View>
        <View style={styles.value}>
          <Text variant="metric">{num(weight.kg)}</Text>
          <Text variant="captionStrong" color="textMuted">
            {unit}
          </Text>
        </View>
        <Text variant="caption" color="textMuted">
          {t('today.glance.weightCaption')}
        </Text>
        {change ? (
          <Text variant="captionStrong" color="textSecondary">
            {t('today.glance.sinceStart', { change })}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const formatDay = (date: string, lang: string) =>
  new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long' }).format(new Date(`${date}T12:00:00`));

const styles = StyleSheet.create({
  glance: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pressable: { borderRadius: radius.card },
  nutrition: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  flex: { flex: 1, gap: spacing.xxs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
  half: { flex: 1, minWidth: 150 },
  halfBody: { gap: spacing.sm },
  value: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  strip: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: spacing.xs },
  dot: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: borderWidth.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restDot: { width: 4, height: 4, borderRadius: radius.pill },
  bold: { fontWeight: '700' },
});
