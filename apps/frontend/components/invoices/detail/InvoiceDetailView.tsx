'use client';

import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import { DETAIL_COLUMN, DETAIL_GRID, DetailSlot } from '@/components/detail/DetailSlot';
import { ConfirmDialog } from '@/components/ui/dialog';
import { SectionCard } from '@/components/ui/SectionCard';
import { isolateNumber } from '@/components/orders/OrderNumber';
import { formatInvoicePhone } from '@/lib/invoiceFormatting';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { InvoiceStatusBadge } from '../shared/InvoiceStatusBadge';
import { InvoiceDetailHeader } from './InvoiceDetailHeader';
import { InvoicePdfButton } from './InvoicePdfButton';
import { InvoiceSellerCard } from './InvoiceSellerCard';
import { InvoiceAccountCard } from './InvoiceAccountCard';
import { InvoiceOrderCard } from './InvoiceOrderCard';
import { InvoiceDocumentPreview } from './InvoiceDocumentPreview';
import { LinesList } from './LinesList';
import { TotalsCard } from './TotalsCard';
import { PartyCard } from './PartyCard';
import type { InvoiceDetailState } from './useInvoiceDetailState';

export function InvoiceDetailView({ invoice: i, state }: { invoice: Invoice; state: InvoiceDetailState }) {
  const t = useTranslations('invoices.detail');
  const paid = state.confirm === 'paid';
  return <>
    <div className="contents lg:hidden"><TopBar back hideSearch title={isolateNumber(i.number)} action={<DetailActionsMenu actions={state.menu} variant="sheet" />} /></div>
    <InvoiceDetailHeader invoice={i} menu={state.menu} />
    <div className="flex flex-col gap-4 p-4 pb-28 lg:pt-5 lg:pb-8">
      <div className="self-start lg:hidden"><InvoiceStatusBadge status={i.status} /></div>
      <div className={DETAIL_GRID}>
        <div className={DETAIL_COLUMN}>
          <DetailSlot order="max-lg:order-2"><LinesList invoice={i} /></DetailSlot>
          <DetailSlot order="max-lg:order-3"><TotalsCard invoice={i} /></DetailSlot>
          <DetailSlot order="max-lg:order-4"><InvoiceAccountCard invoice={i} /></DetailSlot>
          <DetailSlot order="max-lg:order-8">{i.notes && <SectionCard title={t('notes')}><p className="px-5 py-4 text-sm whitespace-pre-wrap">{i.notes}</p></SectionCard>}</DetailSlot>
          <DetailSlot order="max-lg:order-9">{i.seller_legal_mentions && <SectionCard title={t('legal_mentions')}><p className="px-5 py-4 text-xs text-muted-foreground whitespace-pre-wrap">{i.seller_legal_mentions}</p></SectionCard>}</DetailSlot>
        </div>
        <div className={`${DETAIL_COLUMN} lg:sticky lg:top-6`}>
          <DetailSlot order="max-lg:order-5"><InvoiceSellerCard invoice={i} /></DetailSlot>
          <DetailSlot order="max-lg:order-1"><PartyCard title={t('buyer')} name={i.buyer_name || '—'} address={i.buyer_address}
            rightLink={i.customer ? { href: `/customers/${i.customer}`, label: t('customer_card') } : undefined}
            extras={[i.buyer_email, formatInvoicePhone(i.buyer_phone, i.buyer_country)]} /></DetailSlot>
          <DetailSlot order="max-lg:order-6"><InvoiceOrderCard invoice={i} /></DetailSlot>
          <DetailSlot order="max-lg:order-7"><InvoiceDocumentPreview invoice={i} /></DetailSlot>
        </div>
      </div>
    </div>
    <FloatingActionBar variant="button"><InvoicePdfButton id={i.id} className="h-12 w-full shadow-lg" /></FloatingActionBar>
    <ConfirmDialog open={state.confirm !== null} onOpenChange={open => { if (!open && !state.pending) state.setConfirm(null); }}
      title={t(paid ? 'confirm_paid_title' : 'confirm_cancel_title')} description={t(paid ? 'confirm_paid_body' : 'confirm_cancel_body')}
      confirmLabel={t('confirm')} cancelLabel={t('keep_invoice')} variant={paid ? 'default' : 'destructive'} onConfirm={state.submit} />
  </>;
}
