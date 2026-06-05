'use client';

import { useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import { apiFetch } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useProducts, useProduct, formatStock, type ProductVariant } from '@/lib/hooks/useProducts';
import { qk } from '@/lib/query-keys';

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

function StockAddForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const { data: products } = useProducts({ type: 'product' });

  const initialProduct = searchParams.get('product') ?? '';
  const initialVariant = searchParams.get('variant') ?? '';

  const [productId, setProductId] = useState(initialProduct);
  const [variantId, setVariantId] = useState(initialVariant);
  const [quantity,  setQuantity]  = useState('1');
  const [reason,    setReason]    = useState('Réassort');
  const [isPending, setIsPending] = useState(false);
  const [error,     setError]     = useState('');

  const { data: productDetail } = useProduct(productId);
  const activeVariants: ProductVariant[] = useMemo(
    () => productDetail?.variants.filter((v) => v.is_active) ?? [],
    [productDetail],
  );

  const onlyVariant = activeVariants.length === 1 ? activeVariants[0] : null;
  const effectiveVariantId = variantId || onlyVariant?.id || '';
  const selectedVariant = activeVariants.find((v) => v.id === effectiveVariantId) ?? null;
  const qtyUnitLabel = selectedVariant ? quantityLabel(selectedVariant) : null;

  async function handleSubmit() {
    if (!effectiveVariantId) { setError('Sélectionnez un conditionnement.'); return; }
    const qty = parseFloat(quantity);
    if (!Number.isFinite(qty) || qty <= 0) { setError('Quantité invalide.'); return; }
    setIsPending(true); setError('');
    try {
      await apiFetch('/stock/in/', {
        method: 'POST',
        body: JSON.stringify({ variant: effectiveVariantId, quantity: quantity, reason }),
      });
      qc.invalidateQueries({ queryKey: qk.products.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.all });
      router.back();
    } catch {
      setError("Erreur lors de l'ajout de stock.");
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
          value={effectiveVariantId}
          onChange={(e) => setVariantId(e.target.value)}
        >
          {activeVariants.length > 1 && <option value="">Sélectionner un conditionnement…</option>}
          {activeVariants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.packaging_name} (stock actuel : {formatStock(v.stock_quantity, v.unit, { baseQuantity: v.base_quantity, packagingName: v.packaging_name })})
            </option>
          ))}
        </FloatingSelect>
      )}

      {selectedVariant && (
        <div className="rounded-2xl bg-muted/60 border border-border px-4 py-3 text-sm text-muted-foreground">
          Stock actuel : <span className="font-semibold text-foreground">{formatStock(selectedVariant.stock_quantity, selectedVariant.unit, { baseQuantity: selectedVariant.base_quantity, packagingName: selectedVariant.packaging_name })}</span>
        </div>
      )}

      <FloatingInput
        id="quantity"
        label="Quantité à ajouter *"
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
        label="Raison (optionnel)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {error && <p className="text-[11px] text-destructive px-1">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending} className="w-full mt-1">
        {isPending ? 'Enregistrement…' : 'Ajouter au stock'}
      </Button>
    </div>
  );
}

export default function StockAddPage() {
  return (
    <>
      <TopBar title="Entrée stock" />
      <Suspense><StockAddForm /></Suspense>
    </>
  );
}
