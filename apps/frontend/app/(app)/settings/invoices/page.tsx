'use client';

import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { SectionsSkeleton } from '@/components/ui/SectionsSkeleton';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useInvoiceSettings } from '@/lib/hooks/useInvoiceSettings';
import { InvoiceSettingsForm } from '@/components/settings/invoices/InvoiceSettingsForm';

export default function InvoiceSettingsPage() {
  const t = useTranslations('invoice_settings');
  const back = useBackOr('/settings');
  const { data, isLoading, isError, refetch } = useInvoiceSettings();
  return (
    <div className="mx-auto w-full max-w-280">
      <TopBar back hideSearch title={t('title')} subtitle={t('subtitle')} backLabel={t('back')} onBack={back} />
      {isLoading && <SectionsSkeleton sections={[3, 3, 2]} className="px-4 pt-4 pb-28" />}
      {isError && <div role="alert" className="flex flex-col items-start gap-3 p-5 text-sm">
        <p>{t('load_error')}</p>
        <button type="button" onClick={() => refetch()} className="font-semibold text-primary underline">{t('retry')}</button>
      </div>}
      {data && <InvoiceSettingsForm settings={data} onLeave={back} />}
    </div>
  );
}
