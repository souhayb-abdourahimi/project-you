import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, Text } from '@/components/ui';
import { formatDate } from '@/lib/format';

import type { ProgramWeekView } from './useProgramWeek';

/** The version in force and why it exists (`program.reason.*`), with the way to the history. */
export function ProgramVersionCard({ version }: { version: ProgramWeekView['version'] }) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      {version ? (
        <>
          <Text variant="label" color="textMuted">
            {t('program.version', {
              version: version.version,
              date: formatDate(String(version.params.from), i18n.language),
            })}
          </Text>
          <Text>{t(version.key)}</Text>
        </>
      ) : null}
      <Button compact variant="secondary" label={t('history.open')} onPress={() => router.push('/history')} />
    </Card>
  );
}
