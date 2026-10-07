import { useState } from 'react';
import { useProducts, type Product } from '@/lib/hooks/useProducts';
import type { PickFilter } from '@/components/orders/picker/PickView';
import type { VariantPick } from '@/components/orders/picker/VariantView';

export interface CatalogPickerState {
  open: boolean;
  view: 'pick' | 'free';
  stage: 'list' | 'variants';
  pickedProductId: string | null;
  search: string;
  filter: PickFilter;
  products: Product[];
  filtered: Product[];
  openPicker: () => void;
  close: () => void;
  handlePickProduct: (p: Product) => void;
  handlePickVariant: (pick: VariantPick, onPick: (pick: VariantPick) => void) => void;
  handleCreate: (onRequestCreate: () => void) => void;
  goToFreeLine: () => void;
  backToList: () => void;
  setSearch: (v: string) => void;
  setFilter: (f: PickFilter) => void;
}

export function useCatalogPicker(): CatalogPickerState {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'pick' | 'free'>('pick');
  const [stage, setStage] = useState<'list' | 'variants'>('list');
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

  function openPicker() {
    setOpen(true);
  }

  function handlePickProduct(p: Product) {
    setPickedProductId(p.id);
    setStage('variants');
  }

  function handlePickVariant(pick: VariantPick, onPick: (pick: VariantPick) => void) {
    onPick(pick);
    close();
  }

  function handleCreate(onRequestCreate: () => void) {
    close();
    onRequestCreate();
  }

  function goToFreeLine() {
    setView('free');
  }

  function backToList() {
    setView('pick');
    setStage('list');
    setPickedProductId(null);
  }

  return {
    open,
    view,
    stage,
    pickedProductId,
    search,
    filter,
    products,
    filtered,
    openPicker,
    close,
    handlePickProduct,
    handlePickVariant,
    handleCreate,
    goToFreeLine,
    backToList,
    setSearch,
    setFilter,
  };
}
