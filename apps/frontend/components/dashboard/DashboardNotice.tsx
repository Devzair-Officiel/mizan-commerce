'use client';

import Link from 'next/link';
import { MailWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { NoticeCard } from '@/components/dashboard/NoticeCard';
import { useMe, useResendEmailVerification } from '@/lib/hooks/useMe';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { useZakatProfile } from '@/lib/hooks/useZakat';

/** Le bandeau de la zakat apparaît dans le dernier mois avant le jour J. */
const ZAKAT_NOTICE_DAYS = 30;

/** Un seul bandeau à la fois (§ 7) : l'adresse email à vérifier passe avant la zakat. */
export function DashboardNotice() {
  const { data: me } = useMe();
  const gating = usePlanGating();
  // Zakat : administrateurs dont la formule la couvre, et seulement si le jour J est réglé.
  const zakatAllowed = me?.membership?.is_admin === true && !gating.isLoading && gating.can('zakat');
  const { data: zakat } = useZakatProfile(zakatAllowed);

  const needsEmailVerif = me !== undefined && !me.email_verified_at;
  const next = zakatAllowed ? zakat?.next_hawl ?? null : null;

  if (needsEmailVerif) return <EmailNotice />;
  if (next && next.days_remaining <= ZAKAT_NOTICE_DAYS) return <ZakatNotice days={next.days_remaining} />;
  return null;
}

function EmailNotice() {
  const t = useTranslations('dashboard.notice');
  const { mutate, isPending, data, isSuccess } = useResendEmailVerification();
  const justVerified = isSuccess && data?.already_verified;
  const justSent = isSuccess && !data?.already_verified;
  const noticeTitle = justVerified ? t('email_verified') : justSent ? t('email_sent') : t('email_title');
  return (
    <NoticeCard
      icon={<MailWarning className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden />}
      title={noticeTitle}
      sub={!isSuccess ? t('email_sub') : undefined}
      action={
        !justVerified ? (
          <Button size="sm" disabled={isPending} onClick={() => mutate()}
            className="h-7 shrink-0 bg-amber-500/15 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-500/25 dark:text-amber-300">
            {isPending ? '…' : justSent ? t('email_resend') : t('email_cta')}
          </Button>
        ) : undefined
      }
    />
  );
}

function ZakatNotice({ days }: { days: number }) {
  const t = useTranslations('dashboard.notice');
  return (
    <NoticeCard
      icon={<span className="text-amber-700 dark:text-amber-400 text-base leading-none">☾</span>}
      title={t('zakat_title', { days })}
      sub={t('zakat_sub')}
      action={
        <Button render={<Link href="/zakat" />} size="sm" variant="outline"
          className="h-7 shrink-0 px-3 text-xs font-semibold border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/20">
          {t('zakat_cta')}
        </Button>
      }
    />
  );
}
