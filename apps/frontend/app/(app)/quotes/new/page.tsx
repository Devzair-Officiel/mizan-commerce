'use client';

import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { InvoiceEditor } from '@/components/invoices/editor/InvoiceEditor';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useShop } from '@/lib/hooks/useShop';

export default function NewQuotePage() {
  const t = useTranslations('invoices.editor');
  const back = useBackOr('/quotes');
  const { data: shop } = useShop();
  return <div className="mx-auto w-full max-w-280">
    {shop
      ? <InvoiceEditor kind="quote" shop={shop} />
      : <><TopBar title={t('title', { doc: 'quote' })} back backLabel={t('back', { doc: 'quote' })} onBack={back} hideSearch /><div className="mx-4 h-96 animate-pulse rounded-2xl bg-muted" /></>}
  </div>;
}
