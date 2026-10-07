import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { explainDecision } from '@/domain/journey/explain';
import type { DecisionEntry } from '@/domain/journey/training-history';
import { changeLabel } from '@/features/journey/Recommendations';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme';

/**
 * One answer to a training proposal (D-037 journal, append-only): what, the answer, when, why, and
 * for an applied change what was observed after it, compared with before (facts, never a cause).
 */
export function DecisionRow({ entry }: { entry: DecisionEntry }) {
  const { t, i18n } = useTranslation();
  const d = entry.decision;
  const effect = d.status === 'applied' ? entry.effect : null;
  const why = explainDecision(d);
  return (
    <View style={styles.root}>
      <Text variant="label">{changeLabel({ key: entry.change, from: d.from, to: d.to }, t)}</Text>
      <Text color="textMuted">
        {t(`history.answer.${d.status}`, { date: formatDate(d.decidedAt.slice(0, 10), i18n.language) })}
        {entry.inForce ? '' : ` · ${t('history.answer.replacedLater')}`}
      </Text>
      {/* The sentence says what was accepted: an answer "not now" or "no" needs no more than its line. */}
      {d.status === 'applied' ? (
        <Text variant="caption" color="textMuted">
          {t(why.key, why.params)}
        </Text>
      ) : null}
      {effect?.observations.map((o) => (
        <Text key={o} variant="caption">
          {t(`adaptation.effect.${o}`, { days: effect.period.days })}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
});
