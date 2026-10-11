'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { StockExitForm } from '@/components/stock/exit/StockExitForm';
import type { StockExitMotive } from '@/components/stock/exit/useStockExitForm';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useStockLevels } from '@/lib/hooks/useStock';

/** `?motif=` lisible dans l'URL (« Corriger le stock » de la fiche article ouvre `?motif=correction`). */
const MOTIVES: Record<string, StockExitMotive> = { perte: 'loss', casse: 'breakage', 'usage-interne': 'internal_use', correction: 'adjustment' };

function StockExitContent() {
  const t = useTranslations('stock.exit');
  const tPage = useTranslations('stock.page');
  const params = useSearchParams();
  const back = useBackOr('/stock');
  const reason = MOTIVES[params.get('motif') ?? ''] ?? '';
  const variantId = params.get('variant') ?? '';
  const initial = useStockLevels({ variant: variantId }, { enabled: variantId !== '' });
  const ready = variantId === '' || !initial.isPending;

  return (
    <div className="mx-auto w-full max-w-260">
      <TopBar title={t(reason === 'adjustment' ? 'title_count' : 'title')} subtitle={t('subtitle')} back backLabel={tPage('title')}
        onBack={back} hideSearch />
      <div className="px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
        {ready ? (
          <StockExitForm key={`${variantId}-${reason}`} reason={reason} initial={initial.data?.results[0] ?? null}
            onLeave={back} onSaved={back} />
        ) : (
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        )}
      </div>
    </div>
  );
}

export default function StockExitPage() {
  return (
    <Suspense>
      <StockExitContent />
    </Suspense>
  );
}
