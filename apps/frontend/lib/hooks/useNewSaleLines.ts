import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import type { LineItem } from '@/components/orders/new/types';
import type { VariantPick, FreeLine } from '@/components/orders/ProductPicker';

export interface NewSaleLines {
  items: LineItem[];
  addItem: (pick: VariantPick) => void;
  addFreeLine: (line: FreeLine) => void;
  updateQty: (lineId: string, qty: number) => void;
  removeItem: (lineId: string) => void;
  addProductFromQuickAdd: (productId: string) => Promise<void>;
  subtotal: number;
  hasProducts: boolean;
  hasNonProducts: boolean;
  itemsError: boolean;
  clearItemsError: () => void;
}

export function useNewSaleLines(): NewSaleLines {
  const [items, setItems] = useState<LineItem[]>([]);
  const [itemsError, setItemsError] = useState(false);

  function addItem(pick: VariantPick) {
    setItemsError(false);
    setItems((prev) => {
      const existing = prev.find((i) => i.variant === pick.variantId);
      if (existing) {
        return prev.map((i) =>
          i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, {
        lineId: crypto.randomUUID(),
        variant: pick.variantId,
        product_name: pick.productName,
        variant_name: pick.variantName,
        product_type: pick.productType,
        quantity: 1,
        unit_price: pick.unitPrice,
      }];
    });
  }

  function addFreeLine(line: FreeLine) {
    setItemsError(false);
    setItems((prev) => [...prev, {
      lineId: crypto.randomUUID(),
      variant: null,
      product_name: line.product_name,
      variant_name: '',
      product_type: null,
      quantity: line.quantity,
      unit_price: line.unit_price,
    }]);
  }

  function updateQty(lineId: string, qty: number) {
    if (qty < 1) {
      setItems((prev) => prev.filter((i) => i.lineId !== lineId));
      return;
    }
    setItems((prev) => prev.map((i) => i.lineId === lineId ? { ...i, quantity: qty } : i));
  }

  function removeItem(lineId: string) {
    setItems((prev) => prev.filter((i) => i.lineId !== lineId));
  }

  async function addProductFromQuickAdd(productId: string) {
    const detail = await apiFetch<ProductDetail>(`/products/${productId}/`);
    const first = detail.variants.find((v) => v.is_active);
    if (!first) return;
    addItem({
      variantId: first.id,
      productName: detail.name,
      variantName: first.packaging_name,
      productType: detail.type,
      unitPrice: first.selling_price,
    });
  }

  const subtotal = items.reduce((acc, i) => acc + parseFloat(i.unit_price) * i.quantity, 0);
  const hasProducts = items.some((i) => i.product_type === 'product');
  const hasNonProducts = items.some((i) => i.product_type !== 'product');

  return {
    items,
    addItem,
    addFreeLine,
    updateQty,
    removeItem,
    addProductFromQuickAdd,
    subtotal,
    hasProducts,
    hasNonProducts,
    itemsError,
    clearItemsError: () => setItemsError(false),
  };
}
