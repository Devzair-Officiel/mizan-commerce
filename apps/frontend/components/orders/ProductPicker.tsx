'use client';

import { useTranslations } from 'next-intl';
import { ChevronRight, Plus } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCatalogPicker } from '@/lib/hooks/useCatalogPicker';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { PickView } from './picker/PickView';
import { FreeLineView, type FreeLine } from './picker/FreeLineView';
import { VariantView, type VariantPick } from './picker/VariantView';

export type { FreeLine, VariantPick };

interface ProductPickerProps {
  onPick: (pick: VariantPick) => void;
  onFreeLine: (line: FreeLine) => void;
  onRequestCreate: () => void;
}

export function ProductPicker({ onPick, onFreeLine, onRequestCreate }: ProductPickerProps) {
  const t = useTranslations('orders.picker');
  const kind = useCatalogKind();
  const picker = useCatalogPicker();

  const title = picker.view === 'free'
    ? t('free_sheet_title')
    : picker.stage === 'variants'
      ? t('variant_sheet_title')
      : t('product_sheet_title', { kind });

  return (
    <>
      <button
        type="button"
        onClick={picker.openPicker}
        aria-haspopup="dialog"
        className="w-full text-left rounded-2xl border border-border bg-card p-3 flex items-center gap-3 transition-colors active:bg-muted"
      >
        <div className="shrink-0 w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Plus size={18} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">{t('product_trigger_title', { kind })}</span>
          <span className="text-xs text-muted-foreground">{t('product_trigger_sub')}</span>
        </div>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
      </button>

      <BottomSheet open={picker.open} onClose={picker.close} title={title}>
        {picker.view === 'free' ? (
          <FreeLineView
            onCancel={picker.backToList}
            onSubmit={(line) => { onFreeLine(line); picker.close(); }}
          />
        ) : picker.stage === 'variants' && picker.pickedProductId ? (
          <VariantView
            productId={picker.pickedProductId}
            onBack={() => { picker.backToList(); }}
            onPick={(pick) => picker.handlePickVariant(pick, onPick)}
          />
        ) : (
          <PickView
            search={picker.search}
            setSearch={picker.setSearch}
            filter={picker.filter}
            setFilter={picker.setFilter}
            products={picker.filtered}
            onPick={picker.handlePickProduct}
            onCreate={() => picker.handleCreate(onRequestCreate)}
            onFreeLine={picker.goToFreeLine}
          />
        )}
      </BottomSheet>
    </>
  );
}
