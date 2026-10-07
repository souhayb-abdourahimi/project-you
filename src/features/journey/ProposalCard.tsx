import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, Icon, Row, Text } from '@/components/ui';
import type { Recommendation } from '@/domain/journey/adaptation';
import { proposalView, type Copy, type ProposalAnswer } from '@/domain/journey/proposal';
import type { IsoDate } from '@/domain/shared/dates';
import { getExercise } from '@/domain/training/exercises';
import { spacing } from '@/theme';

import { changeLabel } from './Recommendations';
import { useDecision } from './useDecision';

/**
 * One proposal, told like a coach (D-037 §18, §36): the facts and what can be done, what changes,
 * for how long, what it does. Answers: apply (or an option), "Pas maintenant", "Refuser", and
 * "Pourquoi ?" for the facts read. A durable change of exercise asks for a confirmation first.
 */
export function ProposalCard({ recommendation: r, today }: { recommendation: Recommendation; today: IsoDate }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { decide } = useDecision(today);
  const [why, setWhy] = useState(false);
  const [confirming, setConfirming] = useState<ProposalAnswer | null>(null);
  const view = proposalView(r, (id) => getExercise(id)?.name[lang] ?? id);
  const say = (c: Copy) => t(c.key, c.params);
  const changeText = view.change ? say(view.change) : changeLabel(r.change, t);
  const apply = (answer: ProposalAnswer) =>
    view.confirm && !confirming ? setConfirming(answer) : decide(r, 'applied', answer);

  return (
    <Card tone="accent">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Icon name="coach" size="sm" color="primary" />
        <Text variant="overline" color="primary">
          {t('adaptation.proposal')}
        </Text>
      </View>
      <Text variant="title3">{changeText}</Text>
      <Text color="textSecondary">{say(view.message)}</Text>
      {view.duration ? <Text variant="caption">{say(view.duration)}</Text> : null}
      {view.impact ? <Text variant="caption">{say(view.impact)}</Text> : null}
      {why ? (
        <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
          <Text variant="label">{t('adaptation.whyTitle')}</Text>
          {view.why.map((c) => (
            <Text key={c.key} variant="caption" color="textMuted">
              {say(c)}
            </Text>
          ))}
        </View>
      ) : null}
      {confirming && view.confirm ? (
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityLiveRegion="polite">{say(view.confirm)}</Text>
          <Row>
            <Button compact label={t('adaptation.confirmYes')} onPress={() => decide(r, 'applied', confirming)} />
            <Button compact variant="ghost" label={t('adaptation.confirmNo')} onPress={() => setConfirming(null)} />
          </Row>
        </View>
      ) : (
        <Row>
          {view.answers.map((a) => (
            <Button key={a.option ?? 'apply'} compact label={say(a.label)} onPress={() => apply(a)} />
          ))}
          <Button
            compact
            variant="secondary"
            label={t('adaptation.postpone')}
            accessibilityLabel={t('adaptation.answerA11y', { answer: t('adaptation.postpone'), change: changeText })}
            onPress={() => decide(r, 'postponed')}
          />
          <Button
            compact
            variant="ghost"
            label={say(view.declineLabel)}
            accessibilityLabel={t('adaptation.answerA11y', { answer: say(view.declineLabel), change: changeText })}
            onPress={() => decide(r, 'declined')}
          />
          <Button
            compact
            variant="ghost"
            label={t(why ? 'adaptation.whyHide' : 'adaptation.why')}
            onPress={() => setWhy((w) => !w)}
          />
        </Row>
      )}
    </Card>
  );
}
