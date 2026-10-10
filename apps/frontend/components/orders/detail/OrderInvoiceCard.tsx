'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight, Download, Receipt } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { buttonVariants } from '@/components/ui/button';
import type { Order } from '@/lib/hooks/useOrders';
import { cn } from '@/lib/utils';

const OUTLINE = cn(buttonVariants({ variant: 'outline' }), 'h-10 rounded-full bg-card px-4 font-medium');

interface OrderInvoiceCardProps {
  order: Order;
  onIssue: () => void;
  /** L'émission est déjà l'action principale de la page : la carte n'en montre qu'un rappel. */
  issueIsPrimary: boolean;
}

/** Carte « Facture » : facture liée (lien + PDF) ou bouton d'émission. Masquée si annulée ou vide. */
export function OrderInvoiceCard({ order, onIssue, issueIsPrimary }: OrderInvoiceCardProps) {
  const t = useTranslations('orders.invoiceCard');
  if (order.status === 'cancelled' || order.items.length === 0) return null;
  const invoice = order.invoice;

  if (!invoice) {
    return (
      <SectionCard title={t('title')}>
        <div className="px-4 py-4 lg:px-5">
          <p className="text-sm text-muted-foreground">{t('not_issued')}</p>
          {!issueIsPrimary && (
            <button type="button" onClick={onIssue} className={cn(OUTLINE, 'mt-3')}>
              <Receipt aria-hidden />{t('issue_cta')}
            </button>
          )}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t('title')}>
      <Link href={`/invoices/${invoice.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 lg:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <Receipt size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{t('number_label', { number: invoice.number })}</span>
          <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">{t('status', { status: invoice.status })}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
      </Link>
      <div className="border-t border-border px-4 py-3 lg:px-5">
        <a href={`/api/proxy/invoices/${invoice.id}/pdf/`} target="_blank" rel="noopener"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-primary hover:underline">
          <Download size={14} aria-hidden />{t('download_cta')}
        </a>
      </div>
    </SectionCard>
  );
}
