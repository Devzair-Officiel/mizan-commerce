'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { DraftGate } from '@/components/invoices/editor/DraftGate';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useInvoice } from '@/lib/hooks/useInvoices';
import { useShop } from '@/lib/hooks/useShop';

export default function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('invoices.editor');
  const back = useBackOr('/invoices');
  const { data: invoice, isLoading } = useInvoice(id);
  const { data: shop } = useShop();
  return <div className="mx-auto w-full max-w-280">
    {invoice && shop
      ? <DraftGate key={invoice.id} kind="invoice" draft={invoice} shop={shop} />
      : <><TopBar title={t('title', { doc: 'invoice' })} back backLabel={t('back', { doc: 'invoice' })} onBack={back} hideSearch />
        {isLoading || !shop
          ? <div className="mx-4 h-96 animate-pulse rounded-2xl bg-muted" />
          : <p role="alert" className="p-4 text-sm text-destructive">{t('not_found', { doc: 'invoice' })}</p>}</>}
  </div>;
}
