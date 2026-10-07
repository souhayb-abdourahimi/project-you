import { useTranslation } from 'react-i18next';

import { Notice } from '@/components/ui';
import type { JourneyState } from '@/domain/journey/state';
import { composeMessage, renderMessage } from '@/domain/journey/voice/composer';
import { safetyMessageFor } from '@/domain/journey/voice/safety-message';

/**
 * The safety rule's message on the Today screen (CLAUDE.md rule 8): same voice as the
 * notifications, shown whether or not reminders are on. Null when the rule is not active.
 */
export function SafetyNotice({ state }: { state: JourneyState | null }) {
  const { t } = useTranslation();
  const safety = state ? safetyMessageFor(state.safety) : null;
  if (!state || !safety) return null;
  const message = composeMessage({ ...safety, date: state.today, state, quotePersonalWords: true, history: [] });
  const { title, body } = renderMessage(message, (key, params) => t(key, params));
  // A dedicated, calm surface: identifiable at once, never alarming (W-9).
  return <Notice tone="caution" icon="safety" title={title} message={body} />;
}
