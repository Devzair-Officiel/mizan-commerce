'use client';

import { CheckCircle2, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMe, useResendEmailVerification } from '@/lib/hooks/useMe';

export function EmailVerificationBanner() {
  const { data: me } = useMe();
  const { mutate, isPending, data, isSuccess } = useResendEmailVerification();

  if (!me) return null;
  if (me.email_verified_at) return null;

  const justVerified = isSuccess && data?.already_verified;
  const justSent = isSuccess && !data?.already_verified;

  const message = justVerified
    ? 'Email vérifié — actualisez la page.'
    : justSent
      ? 'Lien renvoyé. Vérifiez votre boîte mail.'
      : 'Confirmez votre adresse email pour sécuriser votre compte.';

  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
      {justVerified ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
      ) : (
        <MailWarning className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
      )}
      <p className="flex-1 font-medium leading-tight">{message}</p>
      {!justVerified && (
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => mutate()}
          className="h-7 shrink-0 bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700"
        >
          {isPending ? 'Envoi…' : justSent ? 'Renvoyer' : 'Renvoyer le lien'}
        </Button>
      )}
    </div>
  );
}
