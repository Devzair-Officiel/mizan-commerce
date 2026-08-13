/**
 * Factory de query keys TanStack Query.
 * Source de vérité unique pour toutes les clés de cache : tout `useQuery`,
 * `useInfiniteQuery` ou `invalidateQueries` doit passer par `qk.*`.
 *
 * Convention :
 *   - `all`     → préfixe racine du domaine (invalidation globale du domaine)
 *   - `list(f)` → liste paginée filtrée
 *   - `detail`  → entité unique
 *   - sous-clés stables et hiérarchiques : invalider `qk.orders.all` invalide
 *     toutes les listes ET les détails ET les sous-collections d'orders.
 */

export interface OrdersListFilters {
  status?: string;
  payment_status?: string;
  customer?: string;
}

export interface OrdersCustomerFilters {
  status?: string | null;
  payment_status?: string | null;
}

export interface ProductsListFilters {
  search?: string;
  all?: boolean;
  inactive?: boolean;
  type?: 'product' | 'service';
  outOfStock?: boolean;
  lowStock?: boolean;
  ordering?: string;
}

export interface StockMovementsFilters {
  productId?: string;
  variantId?: string;
  pageSize?: number;
}

export type RemindersFilter = 'pending' | 'done';

export const qk = {
  orders: {
    all: ['orders'] as const,
    list: (filters: OrdersListFilters) => ['orders', filters] as const,
    byCustomer: (customerId: string, filters: OrdersCustomerFilters) =>
      ['orders', 'customer', customerId, filters] as const,
    detail: (id: string) => ['orders', id] as const,
    activity: (id: string) => ['orders', id, 'activity'] as const,
  },

  notes: {
    all: ['notes'] as const,
    byOrder: (orderId: string) => ['notes', 'order', orderId] as const,
  },

  products: {
    all: ['products'] as const,
    list: (filters: ProductsListFilters) => ['products', filters] as const,
    summary: ['products', 'summary'] as const,
    detail: (id: string) => ['products', id] as const,
  },

  stock: {
    all: ['stock'] as const,
    movements: (filters: StockMovementsFilters) =>
      ['stock', 'movements', filters] as const,
    movementsAll: ['stock', 'movements'] as const,
  },

  search: {
    all: ['search'] as const,
    query: (q: string) => ['search', q] as const,
  },

  dashboard: {
    all: ['dashboard'] as const,
    today: ['dashboard', 'today'] as const,
  },

  shop: {
    all: ['shop'] as const,
  },

  shopMembers: {
    all: ['shop-members'] as const,
  },

  publicPage: {
    all: ['public-page'] as const,
    sections: ['public-page', 'sections'] as const,
    catalog: ['public-page', 'catalog'] as const,
    contacts: ['public-page', 'contacts'] as const,
  },

  reminders: {
    all: ['reminders'] as const,
    byFilter: (filter: RemindersFilter) => ['reminders', filter] as const,
    pending: ['reminders', 'pending'] as const,
    done: ['reminders', 'done'] as const,
  },

  customers: {
    all: ['customers'] as const,
    list: (search: string | undefined, showInactive: boolean | undefined) =>
      ['customers', search, showInactive] as const,
    detail: (id: string) => ['customers', id] as const,
    activity: (
      customerId: string,
      filter: string | null,
      pendingOnly: boolean,
    ) => ['customers', customerId, 'activity', filter, pendingOnly] as const,
  },

  invoices: {
    all: ['invoices'] as const,
    list: (status: string | null) => ['invoices', { status }] as const,
    detail: (id: string) => ['invoices', id] as const,
  },

  me: {
    all: ['me'] as const,
  },

  zakat: {
    all: ['zakat'] as const,
    estimate: ['zakat', 'estimate'] as const,
    lists: ['zakat', 'list'] as const,
    list: (status: string) => ['zakat', 'list', status] as const,
    detail: (id: string | null | undefined) => ['zakat', 'detail', id] as const,
    draft: ['zakat', 'draft'] as const,
  },

  geocode: {
    all: ['geocode'] as const,
    query: (value: string, country: string) =>
      ['geocode', value, country] as const,
  },

  preparedMessages: {
    all: ['prepared-messages'] as const,
    byOrder: (orderId: string) => ['prepared-messages', 'order', orderId] as const,
    byCustomer: (customerId: string) => ['prepared-messages', 'customer', customerId] as const,
  },

  subscription: {
    all: ['subscription'] as const,
    current: ['subscription', 'current'] as const,
  },

  ocr: {
    all: ['ocr'] as const,
    result: (id: string) => ['ocr', 'result', id] as const,
  },
} as const;
