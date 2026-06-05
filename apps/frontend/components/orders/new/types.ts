import type { ProductType } from '@/lib/hooks/useProducts';

export type LineItem = {
  lineId: string;
  variant: string | null;
  product_name: string;
  variant_name: string;
  product_type: ProductType | null;
  quantity: number;
  unit_price: string;
};
