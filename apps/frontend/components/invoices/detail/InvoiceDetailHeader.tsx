'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { useFormatShopDate } from '@/lib/hooks/useFormat';
import { OrderNumber } from '@/components/orders/OrderNumber';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import type { DetailMenuActions } from '@/components/detail/types';
import { InvoiceStatusBadge } from '../shared/InvoiceStatusBadge';
import { InvoicePdfButton } from './InvoicePdfButton';

export function InvoiceDetailHeader({ invoice, menu }: { invoice: Invoice; menu: DetailMenuActions }) {
  const t = useTranslations('invoices');
  const router = useRouter();
  const date = useFormatShopDate();
  const back = () => window.history.length > 1 ? router.back() : router.push('/invoices');
  return <header className="hidden flex-wrap items-end justify-between gap-4 px-4 pt-2 lg:flex">
    <div className="min-w-0">
      <button type="button" onClick={back} className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground whitespace-nowrap">
        <ChevronLeft size={16} className="rtl:rotate-180" aria-hidden />{t('list.title')}
      </button>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-semibold leading-snug tracking-tight">{t('detail.title')} <OrderNumber>{invoice.number}</OrderNumber></h1>
        <InvoiceStatusBadge status={invoice.status} />
      </div>
      {invoice.issued_at && <p className="mt-1.5 text-sm text-muted-foreground">{t('detail.issued_on', { date: date(invoice.issued_at, { dateStyle: 'long', timeStyle: 'short' }) })}</p>}
    </div>
    <div className="flex items-center gap-2"><DetailActionsMenu actions={menu} variant="menu" /><InvoicePdfButton id={invoice.id} /></div>
  </header>;
}
