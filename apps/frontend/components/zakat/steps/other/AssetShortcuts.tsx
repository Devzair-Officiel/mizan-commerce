'use client';

import { Coins, House, Plus, Store, Tag, Wallet, CirclePlus, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ASSET_KINDS, type AssetKind } from './assetForm';
import { PrivateBadge } from './PrivateBadge';

const ICONS: Record<AssetKind, LucideIcon> = {
  personal_cash: Wallet, business: Store, real_estate: House, gold_silver: Coins, for_resale: Tag, other: CirclePlus,
};

/** Six raccourcis d'ajout : carte avec bandeau sur desktop, grille nue sur mobile (le titre est celui de l'étape). */
export function AssetShortcuts({ onAdd }: { onAdd: (kind: AssetKind) => void }) {
  const t = useTranslations('zakat');
  return (
    <section className="lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-card">
      <div className="header-band flex items-start justify-between gap-3 border-b border-border px-5 py-4 max-lg:hidden">
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">{t('steps.other.title')}</h2>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">{t('steps.other.hint')}</p>
        </div>
        <PrivateBadge />
      </div>
      <div role="group" aria-label={t('steps.other.shortcuts_label')} className="grid grid-cols-3 gap-2 lg:gap-2.5 lg:p-5">
        {ASSET_KINDS.map((kind) => {
          const Icon = ICONS[kind];
          return (
            <button key={kind} type="button" onClick={() => onAdd(kind)}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-[0.875rem] border border-border bg-card px-1 py-2 text-center text-xs leading-tight font-semibold text-foreground outline-none hover:border-primary/45 focus-visible:ring-3 focus-visible:ring-primary/30 active:scale-[0.98] lg:min-h-13 lg:flex-row lg:justify-start lg:gap-2.5 lg:px-3.5 lg:text-start lg:text-sm">
              <Icon className="size-5 shrink-0 text-primary" aria-hidden />
              {t(`asset_category.${kind}`)}
              <Plus className="ms-auto size-4.5 shrink-0 text-primary max-lg:hidden" aria-hidden />
            </button>
          );
        })}
      </div>
    </section>
  );
}
