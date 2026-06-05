import { useTranslations } from 'next-intl';
import { Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import {
  formatStock,
  formatUnitPrice,
  useDeleteProductVariant,
  type ProductVariant,
} from '@/lib/hooks/useProducts';
import { useShop } from '@/lib/hooks/useShop';

interface VariantRowProps {
  variant: ProductVariant;
  isProduct: boolean;
  canDelete: boolean;
  productId: string;
  onEdit: () => void;
}

export function VariantRow({ variant, isProduct, canDelete, productId, onEdit }: VariantRowProps) {
  const t = useTranslations('articles.variants');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const currencySymbol = currency === 'EUR' ? '€' : currency;
  const del = useDeleteProductVariant(productId);

  async function handleDelete() {
    if (!confirm(t('confirm_remove', { name: variant.packaging_name }))) return;
    try {
      await del.mutateAsync(variant.id);
    } catch (err) {
      const msg = err instanceof ApiError && typeof err.data === 'object' && err.data !== null
        ? (err.data as { detail?: string }).detail ?? t('remove_failed')
        : t('remove_failed');
      alert(msg);
    }
  }

  const stockTone = variant.is_out_of_stock
    ? 'text-destructive'
    : variant.is_low_stock
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-muted-foreground';

  const unitPrice = formatUnitPrice(variant.selling_price, variant.base_quantity, variant.unit);

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{variant.packaging_name}</p>
          {!variant.is_active && (
            <span className="shrink-0 rounded-full bg-muted text-muted-foreground border border-border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
              {t('inactive_badge')}
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
              <span className="text-muted-foreground truncate">{t('sku_with', { sku: variant.sku })}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {variant.selling_price} {currencySymbol}
        </span>
        {unitPrice && (
          <span className="text-[11px] text-muted-foreground tabular-nums">{unitPrice}</span>
        )}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            aria-label={t('edit_aria')}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil size={14} />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label={t('remove_aria')}
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
