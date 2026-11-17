'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { OrderNumber } from '@/components/orders/OrderNumber';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { NegativeAmount } from '../shared/NegativeAmount';

/** « Avoirs émis » sur la facture : numéro (lien vers l'avoir) et montant négatif. */
export function InvoiceCreditNotesCard({ invoice }: { invoice: Invoice }) {
  const t = useTranslations('invoices.detail');
  if (!invoice.credit_notes.length) return null;
  return <SectionCard title={t('credit_notes')}>
    <ul className="divide-y divide-border">
      {invoice.credit_notes.map(note => <li key={note.id}>
        <Link href={`/invoices/${note.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50 lg:px-5">
          <span className="font-semibold text-primary"><OrderNumber>{note.number}</OrderNumber></span>
          <NegativeAmount value={note.total_ttc} currency={invoice.currency} className="font-semibold text-green-700 dark:text-green-400" />
        </Link>
      </li>)}
    </ul>
  </SectionCard>;
}
