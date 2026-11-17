'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, FileDown, Receipt, XCircle } from 'lucide-react';
import type { DetailAction, DetailMenuActions } from '@/components/detail/types';
import type { Quote } from '@/lib/hooks/useQuotes';
import type { QuoteDetailState } from './useQuoteDetailState';

export const quotePdfHref = (quote: Pick<Quote, 'id'>) => `/api/proxy/quotes/${quote.id}/pdf/`;

/**
 * Action principale, qui suit le statut : envoyé → marquer accepté ; accepté → transformer en
 * facture ; facturé → ouvrir la facture (son éditeur tant qu'elle est un brouillon). Refusé ou
 * expiré : aucune, le PDF prend sa place.
 */
export function useQuotePrimaryAction(quote: Quote, state: QuoteDetailState): DetailAction | null {
  const t = useTranslations('quotes.actions');
  const router = useRouter();
  if (quote.status === 'sent') {
    return { key: 'accept', icon: CheckCircle2, label: t('accept'), disabled: state.pending, onSelect: () => state.open('accept') };
  }
  if (quote.status === 'accepted') {
    return { key: 'convert', icon: Receipt, label: t('convert'), disabled: state.pending, onSelect: state.toInvoice };
  }
  if (quote.status === 'invoiced' && quote.invoice) {
    const number = quote.invoice_number;
    return {
      key: 'invoice', icon: Receipt, label: t('view_invoice', { hasNumber: number ? 'yes' : 'no', number: number ?? '' }),
      onSelect: () => router.push(number ? `/invoices/${quote.invoice}` : `/invoices/${quote.invoice}/edit`),
    };
  }
  return null;
}

/** Menu « ⋯ » : le PDF (s'il n'est pas déjà l'action principale), puis le refus d'un devis envoyé. */
export function useQuoteMenuActions(quote: Quote, state: QuoteDetailState, primary: DetailAction | null): DetailMenuActions {
  const t = useTranslations('quotes.actions');
  const menu: DetailMenuActions = { items: [], danger: null };
  if (primary) menu.items.push({ key: 'pdf', icon: FileDown, label: t('pdf'), href: quotePdfHref(quote) });
  if (quote.status === 'sent') menu.danger = {
    key: 'decline', icon: XCircle, label: t('decline'), destructive: true, disabled: state.pending, onSelect: () => state.open('decline'),
  };
  return menu;
}
