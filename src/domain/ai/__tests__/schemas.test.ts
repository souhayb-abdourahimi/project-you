import { parseCoachAction } from '../schemas';

describe('structured AI outputs', () => {
  it('accepts a valid action', () => {
    expect(parseCoachAction({ type: 'schedule_change', fromDate: '2026-09-30', toDate: '2026-10-01' }).ok).toBe(true);
  });
  it('rejects unknown actions and malformed payloads', () => {
    expect(parseCoachAction({ type: 'delete_account' }).ok).toBe(false);
    expect(parseCoachAction({ type: 'schedule_change', fromDate: 'tomorrow', toDate: '2026-10-01' }).ok).toBe(false);
    expect(parseCoachAction('free text').ok).toBe(false);
  });
  it('requires confirmation for inventory changes', () => {
    const change = { action: 'add', name: 'Riz', quantity: 500, unit: 'g' };
    expect(parseCoachAction({ type: 'inventory_update', requiresConfirmation: false, changes: [change] }).ok).toBe(
      false,
    );
    expect(parseCoachAction({ type: 'inventory_update', requiresConfirmation: true, changes: [change] }).ok).toBe(true);
  });
});
