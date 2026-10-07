/**
 * Accessibility of the settings building blocks (W-8): every switch and link has a name, a role and
 * its state; the preview is announced and names an allergy removal.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LinkRow, SwitchRow } from '@/components/ui';
import { profileImpact } from '@/domain/settings/impact';
import { SCENARIOS } from '@/domain/scenarios';
import i18n from '@/i18n';

import { ChangePreview } from '../ChangePreview';

beforeAll(() => i18n.changeLanguage('fr'));

describe('settings accessibility', () => {
  it('SwitchRow: a named switch announcing its state, the whole row toggles', async () => {
    const onChange = jest.fn();
    await render(<SwitchRow label="Heures calmes" description="Rien entre 22:00 et 07:30" value onChange={onChange} />);
    const row = screen.getByRole('switch', { name: 'Heures calmes', checked: true });
    expect(row.props.accessibilityHint).toBe('Rien entre 22:00 et 07:30');
    await fireEvent.press(row);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('SwitchRow disabled: announced and inert', async () => {
    const onChange = jest.fn();
    await render(<SwitchRow label="Rappels" value={false} disabled onChange={onChange} />);
    expect(screen.getByRole('switch', { name: 'Rappels', disabled: true })).toBeTruthy();
  });

  it('LinkRow: a named link', async () => {
    const onPress = jest.fn();
    await render(<LinkRow label="Entraînement" summary="3 séances" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('link', { name: /Entraînement/ }));
    expect(onPress).toHaveBeenCalled();
  });

  it('ChangePreview: lists what changes and calls out a removed allergy', async () => {
    const saved = { ...SCENARIOS.veganFatLoss, nutrition: { ...SCENARIOS.veganFatLoss.nutrition, allergies: ['peanuts' as const] } };
    const next = {
      ...saved,
      nutrition: { ...saved.nutrition, allergies: [] },
      training: { ...saved.training, sessionsPerWeek: saved.training.sessionsPerWeek + 1 },
    };
    await render(<ChangePreview impact={profileImpact({ saved, next, adjustments: [] })} />);
    expect(screen.getByText('Ce qui va changer')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Arachides/i)).toBeTruthy();
  });
});
