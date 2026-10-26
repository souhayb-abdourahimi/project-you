import { stateFor } from '../__fixtures__/journey';
import { composeMessage } from '../voice/composer';
import { TRIGGERS } from '../voice/types';

/**
 * D-046: the motivation reasons a user picked change the coach's wording only. The goal stays the
 * single source of the plan, and the safety rule still overrides every motivation line.
 */
const NO_WORDS = {};
const reasonsState = stateFor;

function compose(
  opts: {
    reasons?: ('weight' | 'health' | 'energy' | 'strength' | 'habits' | 'mental' | 'event' | 'body_confidence')[];
    quote?: boolean;
    goal?: 'fat_loss' | 'muscle_gain' | 'maintenance';
    safety?: boolean;
    date?: string;
    trigger?: (typeof TRIGGERS)[number];
    history?: Parameters<typeof composeMessage>[0]['history'];
  } = {},
) {
  return composeMessage({
    trigger: opts.trigger ?? 'session_planned',
    date: opts.date ?? '2026-10-01',
    facts: {
      time: '18:00',
      ...(opts.trigger === 'success_streak' ? { weeks: '4' } : {}),
      ...(opts.safety ? { safety: '1' } : {}),
    },
    state: reasonsState({
      goal: opts.goal ?? 'fat_loss',
      motivation: { ...NO_WORDS, reasons: opts.reasons },
      safety: opts.safety ? { flags: ['low_intake'] } : undefined,
    }),
    quotePersonalWords: opts.quote ?? true,
    history: opts.history ?? [],
  });
}

/** The anchors used over two weeks of rotation. */
function anchorsOverTime(opts: Parameters<typeof compose>[0]) {
  const history: Parameters<typeof composeMessage>[0]['history'] = [];
  const keys = new Set<string>();
  for (let d = 1; d <= 14; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    const m = compose({ ...opts, date, history });
    keys.add(m.body[0].key);
    history.push({ date, templateId: m.templateId, channel: 'notification' } as never);
  }
  return keys;
}

describe('coach voice: motivation reasons (wording only)', () => {
  it('a picked reason can be said back ("Tu as dit…") when the user wrote no words', () => {
    const keys = anchorsOverTime({ reasons: ['health', 'energy'] });
    expect(keys).toContain('coach.anchor.none.health');
    expect(keys).toContain('coach.anchor.none.energy');
    expect([...keys].some((k) => k.endsWith('.strength'))).toBe(false);
  });

  it('no reason picked: the anchors are exactly the ones before W-11', () => {
    const keys = anchorsOverTime({ reasons: [] });
    expect([...keys].sort()).toEqual(['coach.anchor.none.v1', 'coach.anchor.none.v2', 'coach.anchor.none.v3']);
    expect(anchorsOverTime({})).toEqual(keys);
  });

  it('the reasons never change the title or the action (what to do), only the anchor', () => {
    for (const trigger of TRIGGERS) {
      const without = compose({ trigger, reasons: [] });
      const withReasons = compose({ trigger, reasons: ['weight', 'health', 'energy', 'strength', 'event'] });
      expect(withReasons.title.key).toBe(without.title.key);
      expect(withReasons.body.slice(1).map((p) => p.key)).toEqual(without.body.slice(1).map((p) => p.key));
    }
  });

  it('"weight" follows the goal direction: lose, gain or keep', () => {
    expect(anchorsOverTime({ reasons: ['weight'], goal: 'fat_loss' })).toContain('coach.anchor.none.weight_lose');
    expect(anchorsOverTime({ reasons: ['weight'], goal: 'muscle_gain' })).toContain('coach.anchor.none.weight_gain');
    expect(anchorsOverTime({ reasons: ['weight'], goal: 'maintenance' })).toContain('coach.anchor.none.weight_keep');
    expect(anchorsOverTime({ reasons: ['weight'], goal: 'fat_loss' })).not.toContain('coach.anchor.none.weight_gain');
  });

  it('a lock screen that hides personal words never shows a picked reason', () => {
    const keys = anchorsOverTime({ reasons: ['weight', 'health', 'body_confidence'], quote: false });
    expect([...keys].every((k) => /\.(v1|v2|v3)$/.test(k))).toBe(true);
  });

  it('while the safety rule is active, every message uses a care anchor: no reason, no goal words', () => {
    for (const trigger of TRIGGERS) {
      const m = compose({ trigger, reasons: ['weight', 'body_confidence', 'health'], safety: true });
      if (trigger === 'safety_low_logging') continue;
      expect(m.anchorSlot).toBe('care');
      expect(m.body[0].key).toMatch(/^coach\.anchor\.care\./);
    }
  });

  it('the free words, when given, still come first (reasons fill the gap, they do not replace them)', () => {
    const m = composeMessage({
      trigger: 'session_planned',
      date: '2026-10-01',
      facts: { time: '18:00' },
      state: stateFor({ motivation: { why: 'être fier de moi', reasons: ['health'] } }),
      quotePersonalWords: true,
      history: [],
    });
    expect(m.anchorSlot).toBe('why');
  });
});
