import { emptyDraft } from '@/domain/onboarding/steps';
import { SCENARIOS } from '@/domain/scenarios';

import { useProfileStore } from '../profile';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/** Review B2: "Refaire le questionnaire" starts from the saved profile, whatever this device holds. */

beforeEach(() => useProfileStore.getState().reset());

describe('restartOnboarding', () => {
  it('after signing in again: the profile comes from the account, the draft was empty', () => {
    // Sign-out reset the device; the sync then pulled the account's profile.
    useProfileStore.getState().setSnapshot(SCENARIOS.veganSoyAllergy);
    expect(useProfileStore.getState().draft).toEqual(emptyDraft());

    useProfileStore.getState().restartOnboarding();

    const { draft, currentStep } = useProfileStore.getState();
    expect(currentStep).toBe('profile.name');
    expect(draft.nutrition).toMatchObject({ diet: 'vegan', allergies: ['soy'] });
    expect(draft.user.displayName).toBe(SCENARIOS.veganSoyAllergy.user.displayName);
  });

  it('on a second device: a stale local draft never replaces the account profile', () => {
    // This device's old questionnaire, answered before the allergy was added on the other device.
    useProfileStore.getState().updateDraft('nutrition', { diet: 'omnivore', allergies: [], intolerances: [] });
    useProfileStore.getState().setSnapshot(SCENARIOS.multipleAllergies);

    useProfileStore.getState().restartOnboarding();

    expect(useProfileStore.getState().draft.nutrition.allergies).toEqual(['gluten', 'milk', 'nuts', 'fish']);
  });

  it('keeps the first-time questionnaire as it is when there is no saved profile yet', () => {
    useProfileStore.getState().updateDraft('user', { displayName: 'Lou' });
    useProfileStore.getState().restartOnboarding();
    expect(useProfileStore.getState().draft.user.displayName).toBe('Lou');
  });
});
