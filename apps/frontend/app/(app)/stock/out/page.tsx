'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import { apiFetch } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useProducts, useProduct, formatStock, type ProductVariant } from '@/lib/hooks/useProducts';

/**
 * Libellé de l'unité de comptage pour les champs de mouvement de stock.
 * On compte des FORMATS, donc :
 *   - piece                                        → "pièces"
 *   - vrac (base_quantity = 1, ex: 1 kg)           → unité brute ("kg")
 *   - conteneurs (base_quantity > 1, ex: 250 mL)   → nom du conditionnement ("Bouteille")
 */
function quantityLabel(v: ProductVariant): string {
  if (v.unit === 'piece') return 'pièces';
  if (parseFloat(v.base_quantity) === 1) return v.unit;
  return v.packaging_name;
}

const MOVEMENT_TYPES = [
  { value: 'out',  label: 'Sortie (vente manuelle)' },
  { value: 'loss', label: 'Perte / casse' },
];

function StockOutForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const { data: products } = useProducts({ type: 'product' });

  const initialProduct = searchParams.get('product') ?? '';
  const initialVariant = searchParams.get('variant') ?? '';

  const [productId,    setProductId]    = useState(initialProduct);
  const [variantId,    setVariantId]    = useState(initialVariant);
  const [quantity,     setQuantity]     = useState('1');
  const [reason,       setReason]       = useState('');
  const [movementType, setMovementType] = useState('out');
  const [isPending,    setIsPending]    = useState(false);
  const [error,        setError]        = useState('');

  const { data: productDetail } = useProduct(productId);
  const activeVariants: ProductVariant[] = useMemo(
    () => productDetail?.variants.filter((v) => v.is_active) ?? [],
    [productDetail],
  );

  useEffect(() => {
    if (!variantId && activeVariants.length === 1) {
      setVariantId(activeVariants[0].id);
    }
  }, [activeVariants, variantId]);

  const selectedVariant = activeVariants.find((v) => v.id === variantId) ?? null;
  const qtyUnitLabel = selectedVariant ? quantityLabel(selectedVariant) : null;

  async function handleSubmit() {
    if (!variantId)     { setError('Sélectionnez un conditionnement.'); return; }
    if (!reason.trim()) { setError('La raison est obligatoire.'); return; }
    const qty = parseFloat(quantity);
    if (!Number.isFinite(qty) || qty <= 0) { setError('Quantité invalide.'); return; }
    setIsPending(true); setError('');
    try {
      await apiFetch('/stock/out/', {
        method: 'POST',
        body: JSON.stringify({ variant: variantId, quantity: quantity, reason, movement_type: movementType }),
      });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      router.back();
    } catch {
      setError('Erreur lors de la sortie de stock.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 pb-8">

      <FloatingSelect
        id="product"
        label="Produit *"
        value={productId}
        onChange={(e) => { setProductId(e.target.value); setVariantId(''); }}
      >
        <option value="">Sélectionner un produit…</option>
        {products?.results.filter((p) => p.is_active).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.variant_count && p.variant_count > 1 ? ` (${p.variant_count} formats)` : ''}
          </option>
        ))}
      </FloatingSelect>

      {productId && activeVariants.length > 0 && (
        <FloatingSelect
          id="variant"
          label="Conditionnement *"
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
        >
          {activeVariants.length > 1 && <option value="">Sélectionner un conditionnement…</option>}
          {activeVariants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.packaging_name} (stock : {formatStock(v.stock_quantity, v.unit, { baseQuantity: v.base_quantity, packagingName: v.packaging_name })})
            </option>
          ))}
        </FloatingSelect>
      )}

      {selectedVariant && (
        <div className="rounded-2xl bg-muted/60 border border-border px-4 py-3 text-sm text-muted-foreground">
          Stock actuel : <span className="font-semibold text-foreground">{formatStock(selectedVariant.stock_quantity, selectedVariant.unit, { baseQuantity: selectedVariant.base_quantity, packagingName: selectedVariant.packaging_name })}</span>
        </div>
      )}

      {/* Type de mouvement — boutons toggle, pas un select */}
      <div className="flex gap-2">
        {MOVEMENT_TYPES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMovementType(value)}
            className={`flex-1 rounded-2xl border px-3 py-3 text-sm font-medium transition-colors ${
              movementType === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <FloatingInput
        id="quantity"
        label="Quantité *"
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        suffix={qtyUnitLabel ?? undefined}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />

      <FloatingInput
        id="reason"
        label="Raison *"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {error && <p className="text-[11px] text-destructive px-1">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending} className="w-full mt-1">
        {isPending ? 'Enregistrement…' : 'Enregistrer la sortie'}
      </Button>
    </div>
  );
}

export default function StockOutPage() {
  return (
    <>
      <TopBar title="Sortie stock" />
      <Suspense><StockOutForm /></Suspense>
    </>
  );
}
