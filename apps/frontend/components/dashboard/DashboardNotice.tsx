'use client';

import Link from 'next/link';
import { MailWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { NoticeCard } from '@/components/dashboard/NoticeCard';
import { useMe, useResendEmailVerification } from '@/lib/hooks/useMe';
import { useShop } from '@/lib/hooks/useShop';
import { computeZakatDays } from '@/components/dashboard/utils';

export function DashboardNotice() {
  const { data: me } = useMe();
  const { data: shop } = useShop();

  const needsEmailVerif = me !== undefined && !me.email_verified_at;
  const zakatDays = computeZakatDays(shop?.zakat_annual_date ?? null);
  const showZakat = !needsEmailVerif && zakatDays !== null && zakatDays <= 30;

  if (needsEmailVerif) return <EmailNotice />;
  if (showZakat) return <ZakatNotice days={zakatDays!} />;
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
            className="h-7 shrink-0 bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700">
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
        <Button render={<Link href="/settings?tab=zakat" />} size="sm" variant="outline"
          className="h-7 shrink-0 px-3 text-xs font-semibold border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/20">
          {t('zakat_cta')}
        </Button>
      }
    />
  );
}
