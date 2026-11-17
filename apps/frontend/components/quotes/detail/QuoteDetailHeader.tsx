'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import type { DetailAction, DetailMenuActions } from '@/components/detail/types';
import { OrderNumber } from '@/components/orders/OrderNumber';
import { useFormatShopDate } from '@/lib/hooks/useFormat';
import type { Quote } from '@/lib/hooks/useQuotes';
import { QuoteStatusBadge } from '../QuoteStatusBadge';
import { QuotePrimaryButton } from './QuotePrimaryButton';

interface QuoteDetailHeaderProps { quote: Quote; primary: DetailAction | null; menu: DetailMenuActions }

/** En-tête desktop : retour, numéro + statut, envoi ; à droite « ⋯ » puis l'action principale. */
export function QuoteDetailHeader({ quote, primary, menu }: QuoteDetailHeaderProps) {
  const t = useTranslations('quotes');
  const router = useRouter();
  const date = useFormatShopDate();
  const back = () => window.history.length > 1 ? router.back() : router.push('/quotes');
  return <header className="hidden flex-wrap items-end justify-between gap-4 px-4 pt-2 lg:flex">
    <div className="min-w-0">
      <button type="button" onClick={back} className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground whitespace-nowrap">
        <ChevronLeft size={16} className="rtl:rotate-180" aria-hidden />{t('title')}
      </button>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-semibold leading-snug tracking-tight">{t('detail.title')} <OrderNumber>{quote.number}</OrderNumber></h1>
        <QuoteStatusBadge status={quote.status} />
      </div>
      {quote.sent_at && <p className="mt-1.5 text-sm text-muted-foreground">{t('detail.sent_on', { date: date(quote.sent_at, { dateStyle: 'long', timeStyle: 'short' }) })}</p>}
    </div>
    <div className="flex items-center gap-2"><DetailActionsMenu actions={menu} variant="menu" /><QuotePrimaryButton quote={quote} primary={primary} /></div>
  </header>;
}
