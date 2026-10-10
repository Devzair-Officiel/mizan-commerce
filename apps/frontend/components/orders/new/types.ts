import type { ProductType } from '@/lib/hooks/useProducts';

export type LineItem = {
  lineId: string;
  /** Ligne déjà enregistrée sur la commande (mode modification) : sert au calcul des différences. */
  itemId?: string;
  variant: string | null;
  /** Article du catalogue (null pour une ligne ponctuelle) : retrouve la ligne depuis le catalogue. */
  product: string | null;
  product_name: string;
  variant_name: string;
  product_type: ProductType | null;
  quantity: number;
  unit_price: string;
};
