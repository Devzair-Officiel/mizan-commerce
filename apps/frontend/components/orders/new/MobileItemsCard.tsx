'use client';

import { useTranslations } from 'next-intl';
import { QuickAddProduct } from '@/components/orders/QuickAddDialogs';
import { ProductPicker } from '@/components/orders/ProductPicker';
import { OrderItemsList } from '@/components/orders/new/OrderItemsList';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';
import type { ProductDetail } from '@/lib/hooks/useProducts';

export function MobileItemsCard({ form }: { form: NewSaleForm }) {
  const t = useTranslations('orders.new');
  const kind = useCatalogKind();
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {form.items.length > 0 && (
        <OrderItemsList noCard items={form.items} onUpdateQty={form.updateQty} onRemove={form.removeItem} />
      )}
      <div className={`p-3 ${form.items.length > 0 ? 'border-t border-border' : ''}`}>
        <ProductPicker variant="dashed" onPick={form.addItem} onFreeLine={form.addFreeLine}
          onRequestCreate={() => form.setCreateProductOpen(true)} itemCount={form.items.length} />
        <QuickAddProduct open={form.createProductOpen} onOpenChange={form.setCreateProductOpen}
          onCreated={(p: ProductDetail) => { void form.addProductFromQuickAdd(p.id); }} />
      </div>
      {form.itemsError && (
        <p className="text-xs text-destructive px-4 pb-2">{t('items_required', { kind })}</p>
      )}
    </div>
  );
}
