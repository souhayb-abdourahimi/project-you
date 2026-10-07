import { useTranslation } from 'react-i18next';

import { Button, CoachNote, Row, Text } from '@/components/ui';
import type { CoachQuestion as Question } from '@/domain/journey/coach';

import { useCoachAnswer } from './useCoachAnswer';
import { useSay } from './useSay';

/**
 * One question from the coach, closed answers only (W-7 §5, §8): what got in the way, or whether
 * to keep a habit in mind. Never blocking: "Pas maintenant" is always there.
 */
export function CoachQuestion({ question, today }: { question: Question; today: string }) {
  const { t } = useTranslation();
  const say = useSay();
  const { answer } = useCoachAnswer(today);
  return (
    <CoachNote label={t('today.coachQuestion')} message={say(question.intro)}>
      <Text variant="headline" accessibilityRole="header">
        {say(question.text)}
      </Text>
      <Row>
        {question.options.map((o) => (
          <Button
            key={o.value}
            compact
            variant="secondary"
            label={say(o.label)}
            accessibilityLabel={
              question.kind === 'blocker' ? t('coachDay.blockerA11y', { cause: say(o.label) }) : undefined
            }
            onPress={() => answer(question, o.value)}
          />
        ))}
      </Row>
      <Button compact variant="ghost" label={t('coachDay.question.later')} onPress={() => answer(question, null)} />
    </CoachNote>
  );
}
