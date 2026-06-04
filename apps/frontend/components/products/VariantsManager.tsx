'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import { ApiError, apiFetch } from '@/lib/api-client';
import {
  UNIT_LABELS,
  formatStock,
  formatUnitPrice,
  useCreateProductVariant,
  useDeleteProductVariant,
  useUpdateProductVariant,
  type ProductDetail,
  type ProductUnit,
  type ProductVariant,
} from '@/lib/hooks/useProducts';

const UNIT_OPTIONS: { value: ProductUnit; label: string }[] = [
  { value: 'piece', label: 'Pièce' },
  { value: 'g',     label: 'Gramme (g)' },
  { value: 'kg',    label: 'Kilogramme (kg)' },
  { value: 'mL',    label: 'Millilitre (mL)' },
  { value: 'L',     label: 'Litre (L)' },
  { value: 'm',     label: 'Mètre (m)' },
];

export function VariantsManager({ product }: { product: ProductDetail }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const variants = [...product.variants].sort(
    (a, b) => a.position - b.position || a.packaging_name.localeCompare(b.packaging_name),
  );

  const isProduct = product.type === 'product';

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Conditionnements
        </h2>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus size={13} />
            Ajouter
          </button>
        )}
      </div>

      {showAdd && (
        <div className="border-b border-border bg-muted/30">
          <VariantEditor
            productId={product.id}
            isProduct={isProduct}
            onDone={() => setShowAdd(false)}
          />
        </div>
      )}

      {variants.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Aucun conditionnement.</p>
      ) : (
        <ul className="divide-y divide-border">
          {variants.map((v) => (
            <li key={v.id}>
              {editingId === v.id ? (
                <VariantEditor
                  productId={product.id}
                  variant={v}
                  isProduct={isProduct}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <VariantRow
                  variant={v}
                  isProduct={isProduct}
                  canDelete={variants.length > 1}
                  productId={product.id}
                  onEdit={() => setEditingId(v.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VariantRow({
  variant,
  isProduct,
  canDelete,
  productId,
  onEdit,
}: {
  variant: ProductVariant;
  isProduct: boolean;
  canDelete: boolean;
  productId: string;
  onEdit: () => void;
}) {
  const del = useDeleteProductVariant(productId);

  async function handleDelete() {
    if (!confirm(`Supprimer le conditionnement "${variant.packaging_name}" ?`)) return;
    try {
      await del.mutateAsync(variant.id);
    } catch (err) {
      const msg = err instanceof ApiError && typeof err.data === 'object' && err.data !== null
        ? (err.data as { detail?: string }).detail ?? 'Suppression impossible.'
        : 'Suppression impossible.';
      alert(msg);
    }
  }

  const stockTone = variant.is_out_of_stock
    ? 'text-destructive'
    : variant.is_low_stock
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-muted-foreground';

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{variant.packaging_name}</p>
          {!variant.is_active && (
            <span className="shrink-0 rounded-full bg-muted text-muted-foreground border border-border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
              Inactif
            </span>
          )}
        </div>
        {(isProduct || variant.sku) && (
          <div className="flex items-center gap-1.5 text-xs">
            {isProduct && (
              <span className={`tabular-nums font-medium ${stockTone}`}>
                {formatStock(variant.stock_quantity, variant.unit, {
                  baseQuantity: variant.base_quantity,
                  packagingName: variant.packaging_name,
                })}
              </span>
            )}
            {isProduct && variant.sku && <span className="text-muted-foreground/60">·</span>}
            {variant.sku && (
              <span className="text-muted-foreground truncate">SKU {variant.sku}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {variant.selling_price} €
        </span>
        {(() => {
          const unitPrice = formatUnitPrice(variant.selling_price, variant.base_quantity, variant.unit);
          return unitPrice && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {unitPrice}
            </span>
          );
        })()}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Modifier"
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil size={14} />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label="Supprimer"
              disabled={del.isPending}
              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function VariantEditor({
  productId,
  variant,
  isProduct,
  onDone,
}: {
  productId: string;
  variant?: ProductVariant;
  isProduct: boolean;
  onDone: () => void;
}) {
  const create = useCreateProductVariant(productId);
  const update = useUpdateProductVariant(productId, variant?.id ?? '');
  const qc = useQueryClient();

  const [packagingName, setPackagingName] = useState(variant?.packaging_name ?? '');
  const [unit, setUnit] = useState<ProductUnit>(variant?.unit ?? 'piece');
  const [baseQuantity, setBaseQuantity] = useState(variant?.base_quantity ?? '1');
  const [sellingPrice, setSellingPrice] = useState(variant?.selling_price ?? '');
  const [purchasePrice, setPurchasePrice] = useState(variant?.purchase_price ?? '');
  const [sku, setSku] = useState(variant?.sku ?? '');
  const [lowStockThreshold, setLowStockThreshold] = useState(variant?.low_stock_threshold ?? '');
  const [initialStock, setInitialStock] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!variant;
  const isPending = create.isPending || update.isPending;

  const unitShort = UNIT_LABELS[unit];
  const stockUnitLabel = unit === 'piece' ? 'pièces' : unitShort;
  // Le stock se compte en FORMATS : nom du conditionnement si défini + composite, sinon unité brute.
  const initialStockSuffix =
    unit === 'piece'
      ? 'pièces'
      : parseFloat(baseQuantity || '1') === 1
        ? unitShort
        : packagingName.trim() || 'formats';
  const unitPricePreview = isProduct
    ? formatUnitPrice(sellingPrice, baseQuantity || '1', unit)
    : null;

  async function handleSave() {
    setError(null);
    if (!packagingName.trim()) { setError('Nom du conditionnement requis.'); return; }
    if (!sellingPrice.trim()) { setError('Prix de vente requis.'); return; }

    const payload = {
      packaging_name: packagingName.trim(),
      unit,
      base_quantity: baseQuantity || '1',
      selling_price: sellingPrice,
      purchase_price: purchasePrice.trim() || null,
      low_stock_threshold: lowStockThreshold.trim() || null,
      sku: sku.trim(),
    };

    try {
      if (isEditing) {
        await update.mutateAsync(payload);
      } else {
        const created = await create.mutateAsync(payload);
        const initialQty = parseFloat(initialStock);
        if (Number.isFinite(initialQty) && initialQty > 0) {
          await apiFetch('/stock/in/', {
            method: 'POST',
            body: JSON.stringify({
              variant: created.id,
              quantity: initialStock,
              reason: 'Stock initial',
            }),
          });
          qc.invalidateQueries({ queryKey: ['products', productId] });
          qc.invalidateQueries({ queryKey: ['products'] });
          qc.invalidateQueries({ queryKey: ['stock', 'movements'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }
      }
      onDone();
    } catch (err) {
      if (err instanceof ApiError && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, string[] | string>;
        const first = (
          data.packaging_name ?? data.selling_price ?? data.purchase_price ??
          data.base_quantity ?? data.sku ?? data.detail
        );
        const msg = Array.isArray(first) ? first[0] : (typeof first === 'string' ? first : null);
        setError(msg ?? 'Une erreur est survenue.');
      } else {
        setError('Impossible d’enregistrer le conditionnement.');
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {/* Identité : nom + SKU côte à côte (pas de suffixe → 2-col tient la route). */}
      <div className="grid grid-cols-2 gap-2">
        <FloatingInput
          id="v-name"
          label={isProduct ? 'Nom du format *' : 'Nom *'}
          value={packagingName}
          onChange={(e) => setPackagingName(e.target.value)}
        />
        <FloatingInput
          id="v-sku"
          label="SKU (optionnel)"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
      </div>

      {/* Unité + Quantité contenue — donne le référentiel pour le prix juste après. */}
      {isProduct && (
        <>
          <FloatingSelect
            id="v-unit"
            label="Unité de mesure"
            value={unit}
            onChange={(e) => setUnit(e.target.value as ProductUnit)}
          >
            {UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </FloatingSelect>
          <FloatingInput
            id="v-base-qty"
            label="Quantité contenue"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            suffix={stockUnitLabel}
            value={baseQuantity}
            onChange={(e) => setBaseQuantity(e.target.value)}
          />
        </>
      )}

      {/* Prix de vente — avec aperçu live du prix unitaire si pertinent. */}
      <div className="flex flex-col gap-1">
        <FloatingInput
          id="v-selling-price"
          label="Prix de vente *"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          suffix="€"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
        />
        {unitPricePreview && (
          <p className="text-[11px] text-muted-foreground px-1 tabular-nums">
            Soit {unitPricePreview}
          </p>
        )}
      </div>

      <FloatingInput
        id="v-purchase-price"
        label="Prix d'achat (optionnel)"
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        suffix="€"
        value={purchasePrice}
        onChange={(e) => setPurchasePrice(e.target.value)}
      />

      {isProduct && (
        <FloatingInput
          id="v-threshold"
          label="Seuil d'alerte (optionnel)"
          type="number"
          step="any"
          min="0"
          inputMode="decimal"
          suffix={stockUnitLabel}
          value={lowStockThreshold}
          onChange={(e) => setLowStockThreshold(e.target.value)}
        />
      )}

      {/* Stock initial — visible uniquement en création. Pour modifier le stock d'un format
          existant, on passe par /stock/add (mouvement avec raison explicite). */}
      {isProduct && !isEditing && (
        <FloatingInput
          id="v-initial-stock"
          label="Stock initial (optionnel)"
          type="number"
          step="any"
          min="0"
          inputMode="decimal"
          suffix={initialStockSuffix}
          value={initialStock}
          onChange={(e) => setInitialStock(e.target.value)}
        />
      )}
      {error && <p className="text-[11px] text-destructive px-1">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={isPending} className="flex-1">
          <Check size={14} />
          {isPending ? 'Enregistrement…' : (isEditing ? 'Mettre à jour' : 'Ajouter')}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          <X size={14} />
          Annuler
        </Button>
      </div>
    </div>
  );
}
