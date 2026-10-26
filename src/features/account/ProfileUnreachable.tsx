import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, EmptyState, Screen } from '@/components/ui';
import { syncNow } from '@/hooks/useSync';
import { spacing } from '@/theme';

/**
 * Signed in on a device without the profile, and the account could not be read yet: onboarding is
 * never offered from a guess (it would start a second profile). The sync keeps retrying on its
 * own; the button retries now.
 */
export function ProfileUnreachable() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <Screen>
      <View style={styles.center}>
        <EmptyState
          icon="offline"
          title={t('auth.unreachable.title')}
          message={t('auth.unreachable.body')}
          action={
            <Button
              label={t('common.retry')}
              loading={busy}
              onPress={() => {
                setBusy(true);
                void syncNow().finally(() => setBusy(false));
              }}
            />
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', paddingVertical: spacing.xl },
});
