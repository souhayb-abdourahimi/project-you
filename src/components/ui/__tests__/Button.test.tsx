/**
 * Design system (W-9): every button keeps its accessible name and states; a metric reads as one
 * sentence; a notice is announced as an alert.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button, IconButton } from '../Button';
import { MetricCard } from '../Card';
import { Badge } from '../Chip';
import { Notice } from '../misc';

describe('Button', () => {
  it.each(['primary', 'secondary', 'tertiary', 'ghost', 'destructive', 'danger'] as const)(
    '%s: a named button that can be pressed',
    async (variant) => {
      const onPress = jest.fn();
      await render(<Button variant={variant} label="Commencer" onPress={onPress} />);
      await fireEvent.press(screen.getByRole('button', { name: 'Commencer' }));
      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );

  it('disabled and loading are announced and do not press', async () => {
    const onPress = jest.fn();
    await render(<Button label="Enregistrer" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Enregistrer' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('an icon button carries its label for screen readers', async () => {
    await render(<IconButton icon="settings" label="Réglages" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Réglages' })).toBeTruthy();
  });
});

describe('MetricCard, Badge, Notice', () => {
  it('a metric is one sentence for screen readers', async () => {
    await render(<MetricCard label="Séances" value="1" unit="/ 3" caption="cette semaine" />);
    expect(screen.getByLabelText('Séances, 1 / 3, cette semaine')).toBeTruthy();
  });

  it('a badge is information, not a button', async () => {
    await render(<Badge label="35 min" />);
    expect(screen.getByText('35 min')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a notice is an alert with its title and message', async () => {
    await render(<Notice tone="caution" title="On ralentit un peu" message="Garde tes séances comme prévu." />);
    expect(screen.toJSON()).toMatchObject({ props: { accessibilityRole: 'alert' } });
    expect(screen.getByText('On ralentit un peu')).toBeTruthy();
  });
});
