'use client';

import { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useProducts, type Product } from '@/lib/hooks/useProducts';
import { PickView, type PickFilter } from './picker/PickView';
import { FreeLineView, type FreeLine } from './picker/FreeLineView';
import { VariantView, type VariantPick } from './picker/VariantView';

export type { FreeLine, VariantPick };

interface ProductPickerProps {
  onPick: (pick: VariantPick) => void;
  onFreeLine: (line: FreeLine) => void;
  onRequestCreate: () => void;
}

type View = 'pick' | 'free';
type Stage = 'list' | 'variants';

export function ProductPicker({ onPick, onFreeLine, onRequestCreate }: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('pick');
  const [stage, setStage] = useState<Stage>('list');
  const [pickedProductId, setPickedProductId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PickFilter>('all');
  const { data } = useProducts({ search });

  const products = (data?.results ?? []).filter((p) => p.is_active);
  const filtered = filter === 'all' ? products : products.filter((p) => p.type === filter);

  function close() {
    setOpen(false);
    setSearch('');
    setFilter('all');
    setView('pick');
    setStage('list');
    setPickedProductId(null);
  }

  function handlePickProduct(p: Product) {
    setPickedProductId(p.id);
    setStage('variants');
  }

  function handlePickVariant(pick: VariantPick) {
    onPick(pick);
    close();
  }

  function handleCreate() {
    close();
    onRequestCreate();
  }

  const title = view === 'free'
    ? 'Ligne libre'
    : stage === 'variants'
      ? 'Choisir un conditionnement'
      : 'Ajouter un article ou service';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="w-full text-left rounded-2xl border border-border bg-card p-3 flex items-center gap-3 transition-colors active:bg-muted"
      >
        <div className="shrink-0 w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Plus size={18} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">Ajouter un article ou service</span>
          <span className="text-xs text-muted-foreground">Catalogue ou ligne libre</span>
        </div>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
      </button>

      <BottomSheet open={open} onClose={close} title={title}>
        {view === 'free' ? (
          <FreeLineView
            onCancel={() => setView('pick')}
            onSubmit={(line) => { onFreeLine(line); close(); }}
          />
        ) : stage === 'variants' && pickedProductId ? (
          <VariantView
            productId={pickedProductId}
            onBack={() => { setStage('list'); setPickedProductId(null); }}
            onPick={handlePickVariant}
          />
        ) : (
          <PickView
            search={search}
            setSearch={setSearch}
            filter={filter}
            setFilter={setFilter}
            products={filtered}
            onPick={handlePickProduct}
            onCreate={handleCreate}
            onFreeLine={() => setView('free')}
          />
        )}
      </BottomSheet>
    </>
  );
}
