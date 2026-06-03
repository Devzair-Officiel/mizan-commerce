'use client';

import { useState } from 'react';
import { ChevronRight, Search, X, PackagePlus, FilePlus2, Plus, ArrowLeft } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import {
  useProducts,
  useProduct,
  type Product,
  type ProductVariant,
} from '@/lib/hooks/useProducts';

export type FreeLine = {
  product_name: string;
  unit_price: string;
  quantity: number;
};

export type VariantPick = {
  variantId: string;
  productName: string;
  variantName: string;
  productType: 'product' | 'service';
  unitPrice: string;
};

interface ProductPickerProps {
  onPick: (pick: VariantPick) => void;
  onFreeLine: (line: FreeLine) => void;
  onRequestCreate: () => void;
}

type Filter = 'all' | 'product' | 'service';
type View = 'pick' | 'free';

type Stage = 'list' | 'variants';

export function ProductPicker({ onPick, onFreeLine, onRequestCreate }: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('pick');
  const [stage, setStage] = useState<Stage>('list');
  const [pickedProductId, setPickedProductId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
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
    // Si une seule variante, on l'envoie directement; sinon on ouvre le sous-écran de sélection.
    if ((p.variant_count ?? 1) <= 1) {
      // On a besoin de la variante par défaut : on passe par le sous-écran qui chargera le détail.
      // Pour économiser un round-trip, on prendra la première via le détail produit.
      setPickedProductId(p.id);
      setStage('variants');
      return;
    }
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

      <BottomSheet
        open={open}
        onClose={close}
        title={
          view === 'free' ? 'Ligne libre'
          : stage === 'variants' ? 'Choisir un conditionnement'
          : 'Ajouter un article ou service'
        }
      >
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

function PickView({
  search,
  setSearch,
  filter,
  setFilter,
  products,
  onPick,
  onCreate,
  onFreeLine,
}: {
  search: string;
  setSearch: (v: string) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
  products: Product[];
  onPick: (p: Product) => void;
  onCreate: () => void;
  onFreeLine: () => void;
}) {
  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'product', label: 'Produits' },
    { value: 'service', label: 'Services' },
  ];

  return (
    <>
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher dans le catalogue…"
          className="w-full rounded-xl border border-border bg-muted py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Effacer la recherche"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        {filters.map((f) => {
          const active = f.value === filter;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={active}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 mb-3">
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-3 text-sm font-medium text-primary transition-colors active:bg-primary/10"
        >
          <span className="shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <PackagePlus size={16} />
          </span>
          <span className="text-left">Créer un article ou service</span>
        </button>
        <button
          type="button"
          onClick={onFreeLine}
          className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-3 text-sm transition-colors active:bg-muted"
        >
          <span className="shrink-0 w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
            <FilePlus2 size={16} />
          </span>
          <span className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
            <span className="font-medium text-foreground">Article ou service ponctuel</span>
            <span className="text-xs text-muted-foreground">Sans enregistrer au catalogue</span>
          </span>
        </button>
      </div>

      <div className="flex flex-col divide-y divide-border -mx-5 px-5">
        {products.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {search || filter !== 'all' ? 'Aucun résultat.' : 'Aucun article enregistré.'}
          </p>
        ) : (
          products.map((p) => {
            const min = p.min_selling_price;
            const max = p.max_selling_price;
            const priceLabel = min && max
              ? (min === max ? `${min} €` : `${min} – ${max} €`)
              : '—';
            const variantCount = p.variant_count ?? 1;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                className="flex items-center gap-3 px-1 py-3 text-left text-foreground transition-colors active:bg-muted"
              >
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium truncate">{p.name}</span>
                    {p.type === 'service' && (
                      <span className="shrink-0 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                        Service
                      </span>
                    )}
                    {variantCount > 1 && (
                      <span className="shrink-0 rounded-full bg-primary/10 text-primary border border-primary/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                        {variantCount} formats
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{priceLabel}</span>
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

function FreeLineView({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (line: FreeLine) => void;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [errors, setErrors] = useState<{ name?: string; price?: string; quantity?: string }>({});

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Le nom est requis.';
    const priceNum = parseFloat(price);
    if (!price || isNaN(priceNum) || priceNum < 0) next.price = 'Le prix est requis.';
    const qtyNum = parseInt(quantity, 10);
    if (!qtyNum || qtyNum < 1) next.quantity = 'La quantité doit être au moins 1.';
    if (Object.keys(next).length) { setErrors(next); return; }
    onSubmit({ product_name: name.trim(), unit_price: priceNum.toFixed(2), quantity: qtyNum });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        <span>Retour au catalogue</span>
      </button>

      <div className="flex flex-col gap-0.5">
        <FloatingInput
          id="fl-name"
          label="Description *"
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
          autoFocus
        />
        {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name}</p>}
      </div>

      <div className="flex gap-3">
        <div className="flex-1 flex flex-col gap-0.5">
          <FloatingInput
            id="fl-price"
            label="Prix unitaire *"
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => { setPrice(e.target.value); setErrors((p) => ({ ...p, price: undefined })); }}
          />
          {errors.price && <p className="text-[11px] text-destructive px-1">{errors.price}</p>}
        </div>
        <div className="w-24 flex flex-col gap-0.5">
          <FloatingInput
            id="fl-qty"
            label="Qté"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => { setQuantity(e.target.value); setErrors((p) => ({ ...p, quantity: undefined })); }}
          />
        </div>
      </div>
      {errors.quantity && <p className="text-[11px] text-destructive px-1 -mt-2">{errors.quantity}</p>}

      <Button type="submit" className="w-full">Ajouter à la commande</Button>
    </form>
  );
}

function VariantView({
  productId,
  onBack,
  onPick,
}: {
  productId: string;
  onBack: () => void;
  onPick: (pick: VariantPick) => void;
}) {
  const { data: product, isLoading } = useProduct(productId);

  function handlePick(variant: ProductVariant) {
    if (!product) return;
    onPick({
      variantId: variant.id,
      productName: product.name,
      variantName: variant.packaging_name,
      productType: product.type,
      unitPrice: variant.selling_price,
    });
  }

  if (isLoading || !product) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onBack}
          className="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Retour</span>
        </button>
        <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  const activeVariants = product.variants.filter((v) => v.is_active);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        <span>Retour au catalogue</span>
      </button>

      <div className="px-1">
        <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
        <p className="text-[11px] text-muted-foreground">{activeVariants.length} conditionnement{activeVariants.length > 1 ? 's' : ''}</p>
      </div>

      <div className="flex flex-col divide-y divide-border -mx-5 px-5">
        {activeVariants.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun conditionnement actif.</p>
        ) : (
          activeVariants.map((v) => {
            const out = product.type === 'product' && parseFloat(v.stock_quantity) <= 0;
            return (
              <button
                key={v.id}
                type="button"
                disabled={out}
                onClick={() => handlePick(v)}
                className="flex items-center gap-3 px-1 py-3 text-left transition-colors active:bg-muted disabled:opacity-50"
              >
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground truncate">{v.packaging_name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {v.selling_price} €
                    {product.type === 'product' && (
                      <>
                        {' · '}
                        <span className={out ? 'text-destructive' : v.is_low_stock ? 'text-amber-600' : ''}>
                          {out ? 'Rupture' : `Stock : ${v.stock_quantity}`}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
