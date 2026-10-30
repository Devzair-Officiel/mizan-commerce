'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { buttonVariants } from '@/components/ui/button';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { DRAFT_KINDS, type DraftKind } from '@/lib/hooks/useDocumentDrafts';
import type { Invoice } from '@/lib/hooks/useInvoices';
import type { Shop } from '@/lib/hooks/useShop';
import { cn } from '@/lib/utils';
import { InvoiceEditor } from './InvoiceEditor';

interface DraftGateProps {
  kind: DraftKind;
  invoice: Invoice;
  shop: Shop;
}

/** Brouillon ou non, décidé au chargement : le document terminé depuis l'éditeur ne le démonte pas avant la redirection. */
export function DraftGate({ kind, invoice, shop }: DraftGateProps) {
  const t = useTranslations('invoices.editor');
  const { route } = DRAFT_KINDS[kind];
  const back = useBackOr(route);
  const [draft] = useState(invoice.status === 'draft');
  if (draft) return <InvoiceEditor kind={kind} invoice={invoice} shop={shop} />;
  return <><TopBar title={t('title')} back backLabel={t('back')} onBack={back} hideSearch />
    <div className="flex flex-col items-start gap-3 p-4"><p className="text-sm text-muted-foreground">{t('not_draft')}</p>
      <Link href={`${route}/${invoice.id}`} className={cn(buttonVariants(), 'h-11 rounded-full px-5')}>{t('open_invoice')}</Link></div></>;
}
