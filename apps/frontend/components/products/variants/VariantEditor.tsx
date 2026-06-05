import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import { ApiError, apiFetch } from '@/lib/api-client';
import {
  UNIT_LABELS,
  formatUnitPrice,
  useCreateProductVariant,
  useUpdateProductVariant,
  type ProductUnit,
  type ProductVariant,
} from '@/lib/hooks/useProducts';
import { useShop } from '@/lib/hooks/useShop';
import { qk } from '@/lib/query-keys';

const UNIT_KEYS: { value: ProductUnit; tKey: 'piece' | 'gram' | 'kilogram' | 'milliliter' | 'liter' | 'meter' }[] = [
  { value: 'piece', tKey: 'piece' },
  { value: 'g',     tKey: 'gram' },
  { value: 'kg',    tKey: 'kilogram' },
  { value: 'mL',    tKey: 'milliliter' },
  { value: 'L',     tKey: 'liter' },
  { value: 'm',     tKey: 'meter' },
];

interface VariantEditorProps {
  productId: string;
  variant?: ProductVariant;
  isProduct: boolean;
  onDone: () => void;
}

export function VariantEditor({ productId, variant, isProduct, onDone }: VariantEditorProps) {
  const t = useTranslations('articles.variants');
  const tUnits = useTranslations('articles.units');
  const tDetail = useTranslations('articles.detail');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const currencySymbol = currency === 'EUR' ? '€' : currency;
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
  const stockUnitLabel = unitShort;
  const initialStockSuffix =
    parseFloat(baseQuantity || '1') === 1
      ? unitShort
      : packagingName.trim() || unitShort;
  const unitPricePreview = isProduct
    ? formatUnitPrice(sellingPrice, baseQuantity || '1', unit)
    : null;

  async function handleSave() {
    setError(null);
    if (!packagingName.trim()) { setError(t('name_required')); return; }
    if (!sellingPrice.trim()) { setError(t('price_required')); return; }

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
              reason: tDetail('initial_stock_reason'),
            }),
          });
          qc.invalidateQueries({ queryKey: qk.products.detail(productId) });
          qc.invalidateQueries({ queryKey: qk.products.all });
          qc.invalidateQueries({ queryKey: qk.stock.movementsAll });
          qc.invalidateQueries({ queryKey: qk.dashboard.all });
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
        setError(msg ?? t('generic_error'));
      } else {
        setError(t('save_failed'));
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="grid grid-cols-2 gap-2">
        <FloatingInput
          id="v-name"
          label={isProduct ? t('name_label_product') : t('name_label_service')}
          value={packagingName}
          onChange={(e) => setPackagingName(e.target.value)}
        />
        <FloatingInput
          id="v-sku"
          label={t('sku_label')}
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
      </div>

      {isProduct && (
        <>
          <FloatingSelect
            id="v-unit"
            label={t('unit_label')}
            value={unit}
            onChange={(e) => setUnit(e.target.value as ProductUnit)}
          >
            {UNIT_KEYS.map((o) => (
              <option key={o.value} value={o.value}>{tUnits(o.tKey)}</option>
            ))}
          </FloatingSelect>
          <FloatingInput
            id="v-base-qty"
            label={t('quantity_label')}
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

      <div className="flex flex-col gap-1">
        <FloatingInput
          id="v-selling-price"
          label={t('sale_price_label')}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          suffix={currencySymbol}
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
        />
        {unitPricePreview && (
          <p className="text-[11px] text-muted-foreground px-1 tabular-nums">
            {t('unit_price_preview', { price: unitPricePreview })}
          </p>
        )}
      </div>

      <FloatingInput
        id="v-purchase-price"
        label={t('purchase_label')}
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        suffix={currencySymbol}
        value={purchasePrice}
        onChange={(e) => setPurchasePrice(e.target.value)}
      />

      {isProduct && (
        <FloatingInput
          id="v-threshold"
          label={t('alert_label')}
          type="number"
          step="any"
          min="0"
          inputMode="decimal"
          suffix={stockUnitLabel}
          value={lowStockThreshold}
          onChange={(e) => setLowStockThreshold(e.target.value)}
        />
      )}

      {isProduct && !isEditing && (
        <FloatingInput
          id="v-initial-stock"
          label={t('initial_stock_label')}
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
          {isPending ? t('saving') : (isEditing ? t('update') : t('add_button'))}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          <X size={14} />
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}
