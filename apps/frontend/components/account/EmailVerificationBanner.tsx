'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMe, useResendEmailVerification } from '@/lib/hooks/useMe';

export function EmailVerificationBanner() {
  const t = useTranslations('profile.email_verification');
  const { data: me } = useMe();
  const { mutate, isPending, data, isSuccess } = useResendEmailVerification();

  if (!me) return null;
  if (me.email_verified_at) return null;

  const justVerified = isSuccess && data?.already_verified;
  const justSent = isSuccess && !data?.already_verified;

  const message = justVerified ? t('verified') : justSent ? t('sent') : t('prompt');

  return (
    <div data-email-verification className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60">
        {justVerified
          ? <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
          : <MailWarning className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden />}
      </span>
      <p role="status" className="min-w-0 flex-1 basis-48 text-sm font-semibold text-foreground leading-tight">{message}</p>
      {!justVerified && (
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => mutate()}
          className="ms-auto h-12 shrink-0 rounded-full bg-amber-500/15 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-500/25 active:scale-[0.98] dark:text-amber-300 lg:h-11"
        >
          {isPending ? t('sending') : justSent ? t('resend') : t('resend_link')}
        </Button>
      )}
    </div>
  );
}
