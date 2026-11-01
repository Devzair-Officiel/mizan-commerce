'use client';

import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import { DETAIL_COLUMN, DETAIL_GRID, DetailSlot } from '@/components/detail/DetailSlot';
import { SectionCard } from '@/components/ui/SectionCard';
import { isolateNumber } from '@/components/orders/OrderNumber';
import { formatInvoicePhone } from '@/lib/invoiceFormatting';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { InvoiceStatusBadge } from '../shared/InvoiceStatusBadge';
import { InvoiceDetailHeader } from './InvoiceDetailHeader';
import { PdfButton } from '@/components/detail/PdfButton';
import { InvoicePaymentBadge } from '../shared/InvoicePaymentBadge';
import { InvoicePaymentRows } from './InvoicePaymentRows';
import { InvoiceSellerCard } from './InvoiceSellerCard';
import { InvoiceAccountCard } from './InvoiceAccountCard';
import { InvoiceOrderCard } from './InvoiceOrderCard';
import { InvoiceCreditNotesCard } from './InvoiceCreditNotesCard';
import { CreditNoteSheet } from '../credit/CreditNoteSheet';
import { InvoiceDetailDialogs } from './InvoiceDetailDialogs';
import { InvoiceDocumentPreview } from './InvoiceDocumentPreview';
import { LinesList } from './LinesList';
import { TotalsCard } from './TotalsCard';
import { PartyCard } from './PartyCard';
import type { InvoiceDetailState } from './useInvoiceDetailState';
import { useInvoiceMenu } from './useInvoiceMenu';

export function InvoiceDetailView({ invoice: i, state }: { invoice: Invoice; state: InvoiceDetailState }) {
  const t = useTranslations('invoices.detail');
  const tTotals = useTranslations('invoices.totals');
  const menu = useInvoiceMenu(i, state);
  return <>
    <div className="contents lg:hidden"><TopBar back hideSearch title={isolateNumber(i.number)} action={<DetailActionsMenu actions={menu} variant="sheet" />} /></div>
    <InvoiceDetailHeader invoice={i} menu={menu} />
    <div className="flex flex-col gap-4 p-4 pb-28 lg:pt-5 lg:pb-8">
      <div className="self-start lg:hidden"><InvoiceStatusBadge status={i.status} /></div>
      <div className={DETAIL_GRID}>
        <div className={DETAIL_COLUMN}>
          <DetailSlot order="max-lg:order-2"><LinesList document={i} title={t('lines_title')} /></DetailSlot>
          <DetailSlot order="max-lg:order-3"><TotalsCard document={i} title={tTotals('title')} rightSlot={<InvoicePaymentBadge invoice={i} />}>
            <InvoicePaymentRows invoice={i} />
          </TotalsCard></DetailSlot>
          <DetailSlot order="max-lg:order-3"><InvoiceCreditNotesCard invoice={i} /></DetailSlot>
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
    <FloatingActionBar variant="button"><PdfButton href={`/api/proxy/invoices/${i.id}/pdf/`} label={t('download_pdf')} className="h-12 w-full shadow-lg" /></FloatingActionBar>
    <InvoiceDetailDialogs state={state} />
    {state.crediting && <CreditNoteSheet invoice={i} onClose={() => state.setCrediting(false)} />}
  </>;
}
