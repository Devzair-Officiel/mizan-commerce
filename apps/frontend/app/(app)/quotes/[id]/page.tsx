'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { DetailPageSkeleton } from '@/components/detail/DetailPageSkeleton';
import { QuoteDetailView } from '@/components/quotes/detail/QuoteDetailView';
import { useQuoteDetailState } from '@/components/quotes/detail/useQuoteDetailState';

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('quotes');
  const router = useRouter();
  const state = useQuoteDetailState(id);
  const draft = state.quote?.status === 'draft';

  // Un brouillon n'a pas de page de détail : il se reprend toujours dans l'éditeur.
  useEffect(() => {
    if (draft) router.replace(`/quotes/${id}/edit`);
  }, [draft, id, router]);

  if (state.quote && !draft) return <QuoteDetailView quote={state.quote} state={state} />;
  if (state.isLoading || draft) return <DetailPageSkeleton title={t('detail.title')} left={[4, 3, 5, 2]} right={[4]} />;
  return <><TopBar title={t('detail.title')} back hideSearch /><p role="alert" className="p-4 text-sm text-destructive">{t('not_found')}</p></>;
}
