import { useTranslation } from 'react-i18next';

import { Card, ChoiceGroup, Text } from '@/components/ui';
import { MASS_UNITS } from '@/domain/settings/units';

import { usePreferenceSettings } from './usePreferenceSettings';

/** Langue, unités, ton du coach: one tap, saved at once (D-043). */
export function PreferencesCard() {
  const { t } = useTranslation();
  const p = usePreferenceSettings();
  return (
    <Card>
      <Text variant="heading">{t('settings.display.title')}</Text>
      <Text variant="label">{t('settings.language')}</Text>
      <ChoiceGroup
        single
        label={t('settings.language')}
        options={[
          { value: 'system', label: t('settings.display.system') },
          { value: 'fr', label: 'Français' },
          { value: 'en', label: 'English' },
        ]}
        selected={[p.language]}
        onToggle={p.setLanguage}
      />
      <Text variant="label">{t('settings.display.unit')}</Text>
      <ChoiceGroup
        single
        label={t('settings.display.unit')}
        options={MASS_UNITS.map((u) => ({ value: u, label: t(`settings.display.units.${u}`) }))}
        selected={[p.unit]}
        onToggle={p.setUnit}
      />
      <Text variant="caption" color="textMuted">
        {t('settings.display.unitHint')}
      </Text>
      <Text variant="label">{t('settings.display.tone')}</Text>
      <ChoiceGroup
        single
        label={t('settings.display.tone')}
        options={(['gentle', 'direct'] as const).map((v) => ({ value: v, label: t(`settings.display.tones.${v}`) }))}
        selected={[p.tone]}
        onToggle={p.setTone}
      />
    </Card>
  );
}
