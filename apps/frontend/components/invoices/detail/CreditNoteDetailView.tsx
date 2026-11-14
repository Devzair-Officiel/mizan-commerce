'use client';

import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { DETAIL_COLUMN, DETAIL_GRID, DetailSlot } from '@/components/detail/DetailSlot';
import { PdfButton } from '@/components/detail/PdfButton';
import { isolateNumber } from '@/components/orders/OrderNumber';
import { SectionCard } from '@/components/ui/SectionCard';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { formatInvoicePhone } from '@/lib/invoiceFormatting';
import { CreditNoteBadge } from '../shared/CreditNoteBadge';
import { CreditNoteOriginCard } from './CreditNoteOriginCard';
import { InvoiceDetailHeader } from './InvoiceDetailHeader';
import { InvoiceSellerCard } from './InvoiceSellerCard';
import { LinesList } from './LinesList';
import { PartyCard } from './PartyCard';
import { TotalsCard } from './TotalsCard';

const NO_MENU = { items: [], danger: null };

/** Détail d'un avoir (D1) : facture d'origine et motif, montants négatifs ; ni paiement, ni relevé, ni menu d'état. */
export function CreditNoteDetailView({ invoice: i }: { invoice: Invoice }) {
  const t = useTranslations('invoices.detail');
  const pdf = `/api/proxy/invoices/${i.id}/pdf/`;
  return <>
    <div className="contents lg:hidden"><TopBar back hideSearch title={isolateNumber(i.number)} /></div>
    <InvoiceDetailHeader invoice={i} menu={NO_MENU} />
    <div className="flex flex-col gap-4 p-4 pb-28 lg:pt-5 lg:pb-8">
      <div className="self-start lg:hidden"><CreditNoteBadge /></div>
      <div className={DETAIL_GRID}>
        <div className={DETAIL_COLUMN}>
          <DetailSlot order="max-lg:order-1"><CreditNoteOriginCard invoice={i} /></DetailSlot>
          <DetailSlot order="max-lg:order-3"><LinesList document={i} title={t('lines_title')} negative /></DetailSlot>
          <DetailSlot order="max-lg:order-4"><TotalsCard document={i} title={t('credit_totals')} negative /></DetailSlot>
          <DetailSlot order="max-lg:order-6">{i.notes && <SectionCard title={t('notes')}><p className="px-5 py-4 text-sm whitespace-pre-wrap">{i.notes}</p></SectionCard>}</DetailSlot>
          <DetailSlot order="max-lg:order-7">{i.seller_legal_mentions && <SectionCard title={t('legal_mentions')}><p className="px-5 py-4 text-xs text-muted-foreground whitespace-pre-wrap">{i.seller_legal_mentions}</p></SectionCard>}</DetailSlot>
        </div>
        <div className={`${DETAIL_COLUMN} lg:sticky lg:top-6`}>
          <DetailSlot order="max-lg:order-2"><PartyCard title={t('buyer')} name={i.buyer_name || '—'} address={i.buyer_address}
            rightLink={i.customer ? { href: `/customers/${i.customer}`, label: t('customer_card') } : undefined}
            extras={[i.buyer_email, formatInvoicePhone(i.buyer_phone, i.buyer_country)]} /></DetailSlot>
          <DetailSlot order="max-lg:order-5"><InvoiceSellerCard invoice={i} /></DetailSlot>
        </div>
      </div>
    </div>
    <FloatingActionBar variant="button"><PdfButton href={pdf} label={t('download_pdf')} className="h-12 w-full shadow-lg" /></FloatingActionBar>
  </>;
}
