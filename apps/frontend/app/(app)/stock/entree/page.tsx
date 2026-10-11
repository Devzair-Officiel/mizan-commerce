'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { ENTRY_PANEL_ID, EntryModeTabs, type EntryMode } from '@/components/stock/entry/EntryModeTabs';
import { InvoiceEntryFlow } from '@/components/stock/entry/InvoiceEntryFlow';
import { ManualEntryForm } from '@/components/stock/entry/ManualEntryForm';
import { confirmLeave } from '@/lib/dirtyGuard';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useShop } from '@/lib/hooks/useShop';
import { useStockLevels } from '@/lib/hooks/useStock';

function StockEntryContent() {
  const t = useTranslations('stock.entry');
  const tPage = useTranslations('stock.page');
  const tLayout = useTranslations('layout.common');
  const router = useRouter();
  const params = useSearchParams();
  const back = useBackOr('/stock');
  const { data: shop } = useShop();
  const mode: EntryMode = params.get('mode') === 'facture' ? 'invoice' : 'manual';
  // `?variant=` : « + Entrée » d'une ligne ou de la fiche article préremplit la première ligne.
  const variantId = params.get('variant') ?? '';
  const initial = useStockLevels({ variant: variantId }, { enabled: mode === 'manual' && variantId !== '' });
  const ready = shop && (mode === 'invoice' || variantId === '' || !initial.isPending);

  function changeMode(next: EntryMode) {
    if (next === mode || !confirmLeave(tLayout('confirm_leave'))) return;
    router.replace(next === 'invoice' ? '/stock/entree?mode=facture' : '/stock/entree');
  }

  return (
    <div className="mx-auto w-full max-w-260">
      <TopBar title={t('title')} subtitle={t('subtitle')} back backLabel={tPage('title')} onBack={back} hideSearch />
      <div className="flex flex-col gap-5 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
        <EntryModeTabs active={mode} onChange={changeMode} />
        <div role="tabpanel" id={ENTRY_PANEL_ID} aria-labelledby={`stock-entry-tab-${mode}`}>
          {!ready ? (
            <div className="h-64 animate-pulse rounded-2xl bg-muted" />
          ) : mode === 'manual' ? (
            <ManualEntryForm key={variantId} currencyCode={shop.currency} initial={initial.data?.results[0] ?? null}
              onLeave={back} onSaved={back} />
          ) : (
            <InvoiceEntryFlow currencyCode={shop.currency} onLeave={back} onSaved={back} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function StockEntryPage() {
  return (
    <Suspense>
      <StockEntryContent />
    </Suspense>
  );
}
