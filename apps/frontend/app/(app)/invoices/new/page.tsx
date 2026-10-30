'use client';

import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { InvoiceEditor } from '@/components/invoices/editor/InvoiceEditor';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useShop } from '@/lib/hooks/useShop';

export default function NewInvoicePage() {
  const t = useTranslations('invoices.editor');
  const back = useBackOr('/invoices');
  const { data: shop } = useShop();
  return <div className="mx-auto w-full max-w-280">
    {shop
      ? <InvoiceEditor kind="invoice" shop={shop} />
      : <><TopBar title={t('title')} back backLabel={t('back')} onBack={back} hideSearch /><div className="mx-4 h-96 animate-pulse rounded-2xl bg-muted" /></>}
  </div>;
}
