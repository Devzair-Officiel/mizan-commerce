'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { InvoiceEditor } from '@/components/invoices/editor/InvoiceEditor';
import { buttonVariants } from '@/components/ui/button';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useInvoice, type Invoice } from '@/lib/hooks/useInvoices';
import { useShop, type Shop } from '@/lib/hooks/useShop';
import { cn } from '@/lib/utils';

/** Brouillon ou non, décidé au chargement : la facture émise depuis l'éditeur ne le démonte pas avant la redirection. */
function DraftGate({ invoice, shop }: { invoice: Invoice; shop: Shop }) {
  const t = useTranslations('invoices.editor');
  const back = useBackOr('/invoices');
  const [draft] = useState(invoice.status === 'draft');
  if (draft) return <InvoiceEditor invoice={invoice} shop={shop} />;
  return <><TopBar title={t('title')} back backLabel={t('back')} onBack={back} hideSearch />
    <div className="flex flex-col items-start gap-3 p-4"><p className="text-sm text-muted-foreground">{t('not_draft')}</p>
      <Link href={`/invoices/${invoice.id}`} className={cn(buttonVariants(), 'h-11 rounded-full px-5')}>{t('open_invoice')}</Link></div></>;
}

export default function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('invoices.editor');
  const back = useBackOr('/invoices');
  const { data: invoice, isLoading } = useInvoice(id);
  const { data: shop } = useShop();
  return <div className="mx-auto w-full max-w-280">
    {invoice && shop
      ? <DraftGate key={invoice.id} invoice={invoice} shop={shop} />
      : <><TopBar title={t('title')} back backLabel={t('back')} onBack={back} hideSearch />
        {isLoading || !shop
          ? <div className="mx-4 h-96 animate-pulse rounded-2xl bg-muted" />
          : <p role="alert" className="p-4 text-sm text-destructive">{t('not_found')}</p>}</>}
  </div>;
}
