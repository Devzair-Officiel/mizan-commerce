'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { QuoteStatusBadge } from '@/components/quotes/QuoteStatusBadge';
import { buttonVariants } from '@/components/ui/button';
import { useQuote } from '@/lib/hooks/useQuotes';
import { cn } from '@/lib/utils';

/**
 * TEMPORAIRE (sous-étape 6b) : à remplacer par le détail du devis en 6c, puis supprimer ce
 * texte provisoire (`quotes.pdf_*`). Un brouillon redirige vers l'éditeur ; un devis envoyé
 * propose son PDF dans un nouvel onglet. Lien et non `window.open` automatique : ouvert hors
 * d'un clic, l'onglet serait bloqué par le navigateur.
 */
export default function QuotePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('quotes');
  const router = useRouter();
  const { data: quote, isLoading } = useQuote(id);
  const draft = quote?.status === 'draft';

  useEffect(() => {
    if (draft) router.replace(`/quotes/${id}/edit`);
  }, [draft, id, router]);

  if (!quote || draft) return <><TopBar title={t('title')} back hideSearch />
    {isLoading || draft
      ? <div className="mx-4 h-40 animate-pulse rounded-2xl bg-muted" />
      : <p role="alert" className="p-4 text-sm text-destructive">{t('not_found')}</p>}</>;
  return <><TopBar title={t('pdf_title', { number: quote.number })} back hideSearch />
    <div className="flex flex-col items-start gap-3 p-4">
      <QuoteStatusBadge status={quote.status} />
      <p className="text-sm text-muted-foreground">{t('pdf_body')}</p>
      <a href={`/api/proxy/quotes/${quote.id}/pdf/`} target="_blank" rel="noopener" className={cn(buttonVariants(), 'h-11 rounded-full px-5')}>
        <ExternalLink aria-hidden />{t('open_pdf')}
      </a>
    </div></>;
}
