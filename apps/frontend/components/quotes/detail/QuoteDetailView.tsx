'use client';

import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import { DETAIL_COLUMN, DETAIL_GRID, DetailSlot } from '@/components/detail/DetailSlot';
import { LinesList } from '@/components/invoices/detail/LinesList';
import { TotalsCard } from '@/components/invoices/detail/TotalsCard';
import { isolateNumber } from '@/components/orders/OrderNumber';
import { ConfirmDialog } from '@/components/ui/dialog';
import { SectionCard } from '@/components/ui/SectionCard';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import type { Quote } from '@/lib/hooks/useQuotes';
import { QuoteStatusBadge } from '../QuoteStatusBadge';
import { AcceptQuoteSheet } from './AcceptQuoteSheet';
import { QuoteBanner } from './QuoteBanner';
import { QuoteConditionsCard } from './QuoteConditionsCard';
import { QuoteDetailHeader } from './QuoteDetailHeader';
import { QuotePrimaryButton } from './QuotePrimaryButton';
import { QuoteTrackingCard } from './QuoteTrackingCard';
import { useQuoteMenuActions, useQuotePrimaryAction } from './useQuoteActions';
import type { QuoteDetailState } from './useQuoteDetailState';

export function QuoteDetailView({ quote: q, state }: { quote: Quote; state: QuoteDetailState }) {
  const t = useTranslations('quotes');
  const kind = useCatalogKind();
  const primary = useQuotePrimaryAction(q, state);
  const menu = useQuoteMenuActions(q, state, primary);
  return <>
    <div className="contents lg:hidden"><TopBar back hideSearch title={isolateNumber(q.number)} action={<DetailActionsMenu actions={menu} variant="sheet" />} /></div>
    <QuoteDetailHeader quote={q} primary={primary} menu={menu} />
    <div className="flex flex-col gap-4 p-4 pb-28 lg:pt-5 lg:pb-8">
      <div className="self-start lg:hidden"><QuoteStatusBadge status={q.status} /></div>
      <div className={DETAIL_GRID}>
        <div className={DETAIL_COLUMN}>
          <DetailSlot order="max-lg:order-1"><QuoteBanner quote={q} /></DetailSlot>
          <DetailSlot order="max-lg:order-3"><LinesList document={q} title={t('detail.lines_title', { kind })} /></DetailSlot>
          <DetailSlot order="max-lg:order-4"><TotalsCard document={q} title={t('detail.totals_title')} /></DetailSlot>
          <DetailSlot order="max-lg:order-5"><QuoteConditionsCard quote={q} /></DetailSlot>
          <DetailSlot order="max-lg:order-6">{q.notes && <SectionCard title={t('detail.notes')}><p className="px-5 py-4 text-sm whitespace-pre-wrap">{q.notes}</p></SectionCard>}</DetailSlot>
        </div>
        <div className={`${DETAIL_COLUMN} lg:sticky lg:top-6`}>
          <DetailSlot order="max-lg:order-2"><QuoteTrackingCard quote={q} /></DetailSlot>
        </div>
      </div>
    </div>
    <FloatingActionBar variant="button"><QuotePrimaryButton quote={q} primary={primary} className="h-12 w-full shadow-lg" /></FloatingActionBar>
    {state.sheet === 'accept' && <AcceptQuoteSheet quote={q} pending={state.pending} onClose={() => state.setSheet(null)} onSubmit={name => void state.accept(name)} />}
    <ConfirmDialog open={state.sheet === 'decline'} onOpenChange={open => { if (!open && !state.pending) state.setSheet(null); }}
      title={t('decline.title')} description={t('decline.body', { number: q.number })}
      confirmLabel={t('decline.confirm')} cancelLabel={t('decline.keep')} variant="destructive" onConfirm={state.decline} />
  </>;
}
