'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCatalogPicker } from '@/lib/hooks/useCatalogPicker';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { productPickQueryOptions } from '@/lib/hooks/useProducts';
import type { Product, ProductDetail } from '@/lib/hooks/useProducts';
import { EmptyCatalogState } from './picker/EmptyCatalogState';
import { PickView, type PickFeedback } from './picker/PickView';
import { FreeLineView, type FreeLine } from './picker/FreeLineView';
import { VariantView, type VariantPick } from './picker/VariantView';

export type { FreeLine, VariantPick };

interface ProductPickerProps {
  onPick: (pick: VariantPick) => void;
  onFreeLine: (line: FreeLine) => void;
  onRequestCreate: () => void;
  /** Article créé depuis l'état « catalogue vide » de la fenêtre. */
  onCreated: (p: ProductDetail) => void;
  variant?: 'default' | 'dashed';
  itemCount?: number;
}

function usePickerProductClick(
  onMultiVariantPick: (p: Product) => void,
  onSingleVariantPick: (pick: VariantPick) => void,
) {
  const queryClient = useQueryClient();
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PickFeedback | null>(null);

  // Les messages (rupture, erreur réseau) s'effacent seuls après quelques secondes.
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  async function handleProductClick(p: Product) {
    if (p.variant_count > 1) { onMultiVariantPick(p); return; }
    if (addingProductId) return;
    setAddingProductId(p.id);
    setFeedback(null);
    try {
      const detail = await queryClient.fetchQuery(productPickQueryOptions(p.id));
      const active = detail.variants.filter((v) => v.is_active);
      const [single] = active;
      if (!single) return;
      if (detail.type === 'product' && parseFloat(single.stock_quantity) <= 0) {
        setFeedback({ productId: p.id, kind: 'out_of_stock' });
        return;
      }
      onSingleVariantPick({ variantId: single.id, productId: detail.id, productName: detail.name, variantName: single.packaging_name, productType: detail.type, unitPrice: single.selling_price });
    } catch {
      setFeedback({ productId: p.id, kind: 'error' });
    } finally {
      setAddingProductId((id) => id === p.id ? null : id);
    }
  }

  return { handleProductClick, addingProductId, feedback };
}

function PickerTrigger({ variant, openPicker }: { variant: 'default' | 'dashed'; openPicker: () => void }) {
  const t = useTranslations('orders.picker');
  const kind = useCatalogKind();
  if (variant === 'dashed') {
    return (
      <button type="button" onClick={openPicker} aria-haspopup="dialog"
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors active:bg-muted">
        <Plus size={16} />
        {t('product_trigger_title', { kind })}
      </button>
    );
  }
  return (
    <button type="button" onClick={openPicker} aria-haspopup="dialog"
      className="w-full text-left rounded-2xl border border-border bg-card p-3 flex items-center gap-3 transition-colors active:bg-muted">
      <div className="shrink-0 w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
        <Plus size={18} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{t('product_trigger_title', { kind })}</span>
        <span className="text-xs text-muted-foreground">{t('product_trigger_sub')}</span>
      </div>
    </button>
  );
}

export function ProductPicker({ onPick, onFreeLine, onRequestCreate, onCreated, variant = 'default', itemCount }: ProductPickerProps) {
  const t = useTranslations('orders.picker');
  const kind = useCatalogKind();
  const picker = useCatalogPicker();
  const { handleProductClick, addingProductId, feedback } = usePickerProductClick(
    picker.handlePickProduct,
    onPick,
  );

  const title = picker.view === 'free'
    ? t('free_sheet_title')
    : picker.stage === 'variants'
      ? t('variant_sheet_title')
      : t('product_sheet_title', { kind });

  return (
    <>
      <PickerTrigger variant={variant} openPicker={picker.openPicker} />
      <BottomSheet open={picker.open} onClose={picker.close} title={title} fullHeight>
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {picker.view === 'free' ? (
              <FreeLineView
                onCancel={picker.backToList}
                onSubmit={(line) => { onFreeLine(line); picker.close(); }}
              />
            ) : picker.stage === 'variants' && picker.pickedProductId ? (
              <VariantView productId={picker.pickedProductId}
                onBack={picker.backToList}
                onPick={(pick) => picker.handlePickVariant(pick, onPick)}
              />
            ) : picker.products.length === 0 && !picker.search ? (
              // Une recherche sans résultat n'est pas un catalogue vide : la recherche reste affichée.
              <EmptyCatalogState onCreated={(p) => { onCreated(p); picker.close(); }} onFreeLine={picker.goToFreeLine} />
            ) : (
              <PickView
                search={picker.search} setSearch={picker.setSearch}
                filter={picker.filter} setFilter={picker.setFilter}
                products={picker.filtered}
                onPick={handleProductClick}
                onCreate={() => picker.handleCreate(onRequestCreate)}
                onFreeLine={picker.goToFreeLine}
                loadingProductId={addingProductId}
                feedback={feedback}
              />
            )}
          </div>
          {typeof itemCount === 'number' && itemCount > 0 && picker.view !== 'free' && (
            <div className="shrink-0 border-t border-border p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={picker.close}
                className="w-full h-11 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center">
                {t('view_cart', { count: itemCount })}
              </button>
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
