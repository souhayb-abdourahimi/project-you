/**
 * Accessibility of the chips (W-3): a single choice is a radio group with a name, each option
 * announces whether it is selected; a multiple choice stays checkboxes.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChoiceGroup } from '../Chip';

const options = [
  { value: 'easy', label: 'Facile' },
  { value: 'hard', label: 'Difficile' },
];

describe('ChoiceGroup', () => {
  it('single: a named radio group whose options announce their checked state', async () => {
    const onToggle = jest.fn();
    await render(<ChoiceGroup single label="Ressenti" options={options} selected={['hard']} onToggle={onToggle} />);
    // The group is a container (not one focusable element, so its options stay reachable one by one).
    expect(screen.getByLabelText('Ressenti').props).toMatchObject({
      role: 'radiogroup',
      accessibilityRole: 'radiogroup',
    });
    expect(screen.getByRole('radio', { name: 'Difficile', checked: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Facile', checked: false })).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Facile' }));
    expect(onToggle).toHaveBeenCalledWith('easy');
  });

  it('multiple: checkboxes, no radio group', async () => {
    await render(<ChoiceGroup options={options} selected={['easy', 'hard']} onToggle={() => {}} />);
    expect(screen.queryByLabelText('Ressenti')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(2);
  });
});
