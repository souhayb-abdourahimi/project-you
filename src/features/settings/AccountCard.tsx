import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, ConfirmButton, Text } from '@/components/ui';

import { useAccount } from './useAccount';

/** Compte (D-043): who is signed in, sign out, export and deletion (in the Privacy Center). */
export function AccountCard() {
  const { t } = useTranslation();
  const account = useAccount();
  const busy = account.signOutState.kind === 'busy';
  return (
    <Card>
      <Text variant="title3">{t('settings.account')}</Text>
      {account.signedIn ? (
        <>
          <Text>{t('settings.accountState.signedIn', { email: account.email ?? '' })}</Text>
          {account.signOutState.kind === 'pending' ? (
            <ConfirmButton
              label={t('settings.signOut.anyway')}
              message={t('settings.signOut.pending', { count: account.signOutState.count })}
              confirmLabel={t('settings.signOut.confirm')}
              onConfirm={() => void account.requestSignOut(true)}
            />
          ) : (
            <Button
              variant="secondary"
              label={t('auth.signOut')}
              accessibilityHint={t('settings.signOut.hint')}
              loading={busy}
              onPress={() => void account.requestSignOut()}
            />
          )}
          {account.signOutState.kind === 'pending' ? (
            <Button variant="ghost" label={t('common.cancel')} onPress={account.cancelSignOut} />
          ) : null}
          {account.signOutState.kind === 'failed' ? (
            <Text color="danger" accessibilityLiveRegion="polite">
              {t('settings.signOut.failed')}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Text>{t('settings.accountState.local')}</Text>
          {account.configured ? (
            <Button variant="secondary" label={t('settings.accountState.signIn')} onPress={account.goToSignIn} />
          ) : null}
        </>
      )}
      <Button variant="secondary" label={t('settings.openPrivacy')} onPress={() => router.push('/privacy')} />
    </Card>
  );
}
