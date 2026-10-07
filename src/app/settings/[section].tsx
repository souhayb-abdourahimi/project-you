import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, EmptyState, Screen, Text } from '@/components/ui';
import { isSettingsSection, type SettingsSection } from '@/domain/settings/sections';
import { StepContent } from '@/features/onboarding/StepContent';
import { ChangePreview } from '@/features/settings/ChangePreview';
import { DecisionNote } from '@/features/settings/DecisionNote';
import { useProfileEdit } from '@/features/settings/useProfileEdit';
import { useUnsavedGuard } from '@/features/settings/useUnsavedGuard';

/** One section of the profile, edited with the questionnaire's own fields (D-043). */
export default function SettingsSectionScreen() {
  const { t } = useTranslation();
  const { section } = useLocalSearchParams<{ section: string }>();
  if (!isSettingsSection(section)) return <EmptyState message={t('settings.form.unknown')} />;
  return <SectionForm section={section} />;
}

function SectionForm({ section }: { section: SettingsSection }) {
  const { t } = useTranslation();
  const edit = useProfileEdit(section);
  useUnsavedGuard(edit.dirty, {
    title: t('settings.form.leaveTitle'),
    message: t('settings.form.leaveMessage'),
    leave: t('settings.form.leave'),
    stay: t('settings.form.stay'),
  });
  if (!edit.saved) return <EmptyState message={t('review.noProfile')} />;

  const missing = [
    ...edit.incomplete.map((step) => t(`onboarding.${step}.title`)),
    ...(edit.incomplete.length === 0 ? edit.issues.map((i) => t(`settings.fields.${i.split(':')[0]}`)) : []),
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: t(`settings.sections.${section}.title`) }} />
      <Text color="textMuted">{t(`settings.sections.${section}.intro`)}</Text>
      <DecisionNote section={section} />
      {edit.steps.map((step) => (
        <Card key={step}>
          <StepContent step={step} draft={edit.draft} update={edit.update} mode="settings" />
        </Card>
      ))}
      {edit.invalid && missing.length > 0 ? (
        <Banner tone="danger" message={t('settings.form.invalid', { fields: missing.join(', ') })} />
      ) : null}
      {edit.dirty && edit.impact ? <ChangePreview impact={edit.impact} /> : null}
      {edit.justSaved ? <Banner tone="success" message={t('settings.form.saved')} /> : null}
      {edit.confirming ? (
        <Card>
          <Text variant="heading">{t('settings.form.confirmTitle')}</Text>
          <Button label={t('settings.form.confirm')} onPress={edit.save} />
          <Button variant="ghost" label={t('common.cancel')} onPress={edit.cancelConfirm} />
        </Card>
      ) : (
        <Button
          label={t('settings.form.save')}
          accessibilityHint={edit.dirty ? undefined : t('settings.form.nothingToSave')}
          disabled={!edit.dirty || edit.invalid}
          onPress={edit.save}
        />
      )}
      {edit.dirty && !edit.confirming ? (
        <Button variant="ghost" label={t('settings.form.discard')} onPress={edit.discard} />
      ) : null}
    </Screen>
  );
}
