/**
 * The coach's voice: builds one message from the catalog, deterministically, for any channel.
 * 1. anchor: one of the user's own answers (why / change / feel), the least recently recalled;
 *    a generic anchor when the user hid personal words or gave none; a `care` anchor for safety
 *    messages, which never lean on the goal;
 * 2. title, action and meaning: least recently used variant that fits the tone, goal and facts.
 * Same inputs and history → same message.
 */
import type { JourneyState } from '../state';
import { ANCHORS, CATALOG, anchorKey, eligible, partKey, type PartKind, type Variant } from './catalog';
import { lastUses, leastRecentlyUsed } from './rotation';
import {
  SAFETY_TRIGGERS,
  type AnchorSlot,
  type ComposedMessage,
  type MessagePart,
  type Trigger,
  type VoiceUse,
} from './types';

/** Long answers are cut on a word boundary so the notification stays readable. */
export const MAX_QUOTE_LENGTH = 80;

export function shortQuote(text: string, max = MAX_QUOTE_LENGTH): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

const PERSONAL: ('why' | 'change' | 'feel')[] = ['why', 'change', 'feel'];

/** Parses `trigger|title|slot.anchor|action|meaning`. */
function templateParts(templateId: string) {
  const [trigger, title, anchor, action, meaning] = templateId.split('|');
  return { trigger, title, anchor, action, meaning };
}

export function composeMessage(input: {
  trigger: Trigger;
  date: string;
  facts: Record<string, string>;
  state: Pick<JourneyState, 'goal' | 'tone' | 'motivation'>;
  quotePersonalWords: boolean;
  /** Messages already used on this channel (rotation). */
  history: VoiceUse[];
}): ComposedMessage {
  const { trigger, date, facts, state, history } = input;
  const ctx = { tone: state.tone, family: state.goal.family, facts };
  const seed = `${date}|${trigger}`;

  // Anchor slot: rotate across the answers the user actually gave.
  const given = PERSONAL.filter((slot) => state.motivation[slot]?.trim());
  const slots: AnchorSlot[] = SAFETY_TRIGGERS.includes(trigger)
    ? ['care']
    : given.length === 0
      ? ['none']
      : input.quotePersonalWords
        ? given
        : ['private'];
  const slotUse = lastUses(history, (e) => [e.anchorSlot]);
  const [slot] = leastRecentlyUsed(slots, (s) => slotUse.get(s) ?? '', '');

  const anchorUse = lastUses(history, (e) => [templateParts(e.templateId).anchor]);
  const [anchor] = leastRecentlyUsed(ANCHORS[slot], (x) => anchorUse.get(`${slot}.${x.id}`) ?? '', seed);

  const pick = (kind: PartKind): Variant => {
    const options = eligible(CATALOG[trigger][kind], ctx);
    const use = lastUses(history, (e) => {
      const p = templateParts(e.templateId);
      return p.trigger === trigger ? [p[kind]] : [];
    });
    const [first] = leastRecentlyUsed(options, (x) => use.get(x.id) ?? '', `${seed}|${kind}`);
    if (!first) throw new Error(`No ${kind} variant for ${trigger} with facts ${Object.keys(facts).join(',')}`);
    return first;
  };
  const title = pick('title');
  const action = pick('action');
  const meaning = pick('meaning');

  const quoteParams: Record<string, string> =
    slot === 'why' || slot === 'change' || slot === 'feel' ? { [slot]: shortQuote(state.motivation[slot] ?? '') } : {};
  const part = (key: string, params: Record<string, string>): MessagePart => ({ key, params });

  return {
    templateId: [trigger, title.id, `${slot}.${anchor.id}`, action.id, meaning.id].join('|'),
    anchorSlot: slot,
    title: part(partKey(trigger, 'title', title.id), facts),
    body: [
      part(anchorKey(slot, anchor.id), quoteParams),
      part(partKey(trigger, 'action', action.id), facts),
      part(partKey(trigger, 'meaning', meaning.id), facts),
    ],
  };
}

/** Renders a composed message with the app's translate function: one sentence per part. */
export function renderMessage(
  message: Pick<ComposedMessage, 'title' | 'body'>,
  t: (key: string, params?: Record<string, string>) => string,
): { title: string; body: string } {
  return {
    title: t(message.title.key, message.title.params),
    body: message.body.map((p) => t(p.key, p.params)).join(' '),
  };
}
