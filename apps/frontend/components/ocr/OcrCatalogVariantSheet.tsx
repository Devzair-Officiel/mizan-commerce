'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ChevronRight, Search, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useProduct, useProducts } from '@/lib/hooks/useProducts';
import type { Product, ProductVariant } from '@/lib/hooks/useProducts';

export interface OcrCatalogVariantPick {
  variantId: string;
  productId: string;
  productName: string;
  packagingName: string;
}

interface OcrCatalogVariantSheetProps {
  open: boolean;
  onClose: () => void;
  invoiceDescription: string;
  onPick: (pick: OcrCatalogVariantPick) => void;
}

/**
 * Sélecteur catalogue dédié au flux OCR (Step 9B).
 *
 * IMPORTANT — pourquoi ne PAS réutiliser `ProductPicker` :
 *   - `ProductPicker` désactive les variantes en rupture de stock (UX vente),
 *     alors qu'en réassort une rupture est exactement ce qu'on veut ré-alimenter.
 *   - Le flux OCR n'a pas besoin de "ligne libre" ni de création de produit
 *     ni de services : on cible strictement les variantes de produits existants.
 *
 * Aucune requête n'est déclenchée tant que le sheet est fermé
 * (`useProducts` et `useProduct` restent en cache TanStack Query).
 */
export function OcrCatalogVariantSheet({
  open, onClose, invoiceDescription, onPick,
}: OcrCatalogVariantSheetProps) {
  const t = useTranslations('stock.catalogSheet');
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  function handleClose() {
    setSelectedProductId(null);
    setSearch('');
    onClose();
  }

  function handlePick(pick: OcrCatalogVariantPick) {
    setSelectedProductId(null);
    setSearch('');
    onPick(pick);
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={t('title')}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {t('line_prefix')}{' '}
          <span className="font-medium text-foreground">{invoiceDescription || '—'}</span>
        </p>

        {selectedProductId ? (
          <VariantListView
            productId={selectedProductId}
            onBack={() => setSelectedProductId(null)}
            onPick={handlePick}
          />
        ) : (
          <ProductListView
            search={search}
            setSearch={setSearch}
            onPickProduct={setSelectedProductId}
          />
        )}
      </div>
    </BottomSheet>
  );
}

// ── Étape 1 : recherche produit ───────────────────────────────────────────

interface ProductListViewProps {
  search: string;
  setSearch: (v: string) => void;
  onPickProduct: (productId: string) => void;
}

function ProductListView({ search, setSearch, onPickProduct }: ProductListViewProps) {
  const t = useTranslations('stock.catalogSheet');
  const { data, isLoading } = useProducts({ search, type: 'product', all: true });
  const products = useMemo<Product[]>(() => data?.results ?? [], [data]);

  return (
    <>
      <div className="relative">
        <Search
          size={15}
          className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('search_placeholder')}
          className="w-full rounded-xl border border-border bg-muted py-2.5 ps-9 pe-9 text-sm outline-none focus:border-primary"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label={t('search_clear_aria')}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="flex flex-col divide-y divide-border -mx-5 px-5">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('loading')}</p>
        ) : products.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {search ? t('no_results') : t('no_products')}
          </p>
        ) : (
          products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPickProduct(p.id)}
              className="flex items-center gap-3 px-1 py-3 min-h-13 text-start transition-colors active:bg-muted"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('variant_formats', { count: p.variant_count })}
                </p>
              </div>
              <ChevronRight
                size={16}
                className="shrink-0 text-muted-foreground rtl:rotate-180"
              />
            </button>
          ))
        )}
      </div>
    </>
  );
}

// ── Étape 2 : sélection variante ──────────────────────────────────────────

interface VariantListViewProps {
  productId: string;
  onBack: () => void;
  onPick: (pick: OcrCatalogVariantPick) => void;
}

function VariantListView({ productId, onBack, onPick }: VariantListViewProps) {
  const t = useTranslations('stock.catalogSheet');
  const { data: product, isLoading } = useProduct(productId);

  if (isLoading || !product) {
    return (
      <div className="flex flex-col gap-3">
        <BackButton onBack={onBack} label={t('back_to_products')} />
        <p className="py-6 text-center text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  const activeVariants = product.variants.filter((v) => v.is_active);

  return (
    <div className="flex flex-col gap-3">
      <BackButton onBack={onBack} label={t('back_to_products')} />

      <div className="px-1">
        <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {t('variant_pick_helper')}
        </p>
      </div>

      <div className="flex flex-col divide-y divide-border -mx-5 px-5">
        {activeVariants.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('no_variants')}</p>
        ) : (
          activeVariants.map((v: ProductVariant) => (
            <button
              key={v.id}
              type="button"
              onClick={() =>
                onPick({
                  variantId: v.id,
                  productId: product.id,
                  productName: product.name,
                  packagingName: v.packaging_name,
                })
              }
              className="flex items-center gap-3 px-1 py-3 min-h-13 text-start transition-colors active:bg-muted"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {v.packaging_name}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {t('stock_short', { qty: v.stock_quantity })}
                </p>
              </div>
              <ChevronRight
                size={16}
                className="shrink-0 text-muted-foreground rtl:rotate-180"
              />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function BackButton({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft size={14} className="rtl:rotate-180" />
      <span>{label}</span>
    </button>
  );
}
