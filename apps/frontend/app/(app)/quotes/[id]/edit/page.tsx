'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { DraftGate } from '@/components/invoices/editor/DraftGate';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useQuote } from '@/lib/hooks/useQuotes';
import { useShop } from '@/lib/hooks/useShop';

export default function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('invoices.editor');
  const back = useBackOr('/quotes');
  const { data: quote, isLoading } = useQuote(id);
  const { data: shop } = useShop();
  return <div className="mx-auto w-full max-w-280">
    {quote && shop
      ? <DraftGate key={quote.id} kind="quote" draft={quote} shop={shop} />
      : <><TopBar title={t('title', { doc: 'quote' })} back backLabel={t('back', { doc: 'quote' })} onBack={back} hideSearch />
        {isLoading || !shop
          ? <div className="mx-4 h-96 animate-pulse rounded-2xl bg-muted" />
          : <p role="alert" className="p-4 text-sm text-destructive">{t('not_found', { doc: 'quote' })}</p>}</>}
  </div>;
}
