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
  page?: number;
  search?: string;
  due?: boolean;
  /** Mois en cours, dans le fuseau de la boutique. */
  period?: 'month';
  /** Champ DRF, préfixé de `-` pour un tri décroissant. */
  ordering?: string;
}

export interface CustomersListFilters {
  /** Sans valeur, l'API ne renvoie que les clients actifs (sélecteur de client). */
  situation?: 'all' | 'active' | 'pending' | 'deactivated';
  /** Clients créés ce mois-ci, dans le fuseau de la boutique. */
  period?: 'month';
  search?: string;
  /** Champ DRF, préfixé de `-` pour un tri décroissant. */
  ordering?: string;
  page?: number;
  page_size?: number;
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

/** Filtres de la page Articles, transmis tels quels à l'API. */
export interface ProductsPageFilters {
  /** Sans valeur, l'API ne renvoie que les actifs (sélecteurs d'article). */
  state?: 'all' | 'active' | 'inactive';
  type?: 'product' | 'service';
  /** Niveau de stock d'un article : rupture, stock faible, en stock. */
  stock?: 'negative' | 'out' | 'low' | 'in';
  search?: string;
  /** Champ DRF, préfixé de `-` pour un tri décroissant. */
  ordering?: string;
  page?: number;
}

export interface StockMovementsFilters {
  /** Famille : entrée, sortie, réservation, libération, correction. */
  type?: 'in' | 'out' | 'reservation' | 'release' | 'adjustment';
  period?: 'today' | '7d' | '30d' | '90d';
  product?: string;
  variant?: string;
  search?: string;
  ordering?: string;
  page?: number;
  pageSize?: number;
}

/** Filtres de l'onglet Niveaux du stock, transmis tels quels à l'API. */
export interface StockLevelsFilters {
  state?: 'negative' | 'out' | 'low' | 'in';
  search?: string;
  /** Un seul format (ligne préremplie par `?variant=`). */
  variant?: string;
  /** stock (défaut), name, purchase_value, last_movement ; `-` pour décroissant. */
  ordering?: string;
  page?: number;
  pageSize?: number;
}

export type ReminderScope = 'todo' | 'upcoming' | 'done';

/** Filtres de la page Rappels, partagés par la liste et les compteurs. */
export interface ReminderFilters {
  search?: string;
  category?: string;
  /** me | team | identifiant d'un membre. */
  for?: string;
  /** Rappels d'une fiche client ou commande. */
  customer?: string;
  order?: string;
}

export const qk = {
  orders: {
    all: ['orders'] as const,
    list: (filters: OrdersListFilters) => ['orders', filters] as const,
    listInfinite: (filters: Omit<OrdersListFilters, 'page'>) => ['orders', 'infinite', filters] as const,
    summary: ['orders', 'summary'] as const,
    facets: (filters: Omit<OrdersListFilters, 'page'>) => ['orders', 'facets', filters] as const,
    byCustomer: (customerId: string, filters: OrdersCustomerFilters) =>
      ['orders', 'customer', customerId, filters] as const,
    detail: (id: string) => ['orders', id] as const,
    activity: (id: string) => ['orders', id, 'activity'] as const,
    /** Carte « Historique » (5, puis « Voir plus »). */
    history: (id: string) => ['orders', id, 'activity', 'history'] as const,
    /** Étapes du suivi : changements de statut. */
    statusChanges: (id: string) => ['orders', id, 'activity', 'status_change'] as const,
    /** Carte « Commandes » de la fiche client (5, puis « Voir plus »). */
    customerWindow: (customerId: string) => ['orders', 'customer', customerId, 'window'] as const,
  },

  notes: {
    all: ['notes'] as const,
    byOrder: (orderId: string) => ['notes', 'order', orderId] as const,
    byCustomer: (customerId: string) => ['notes', 'customer', customerId] as const,
  },

  products: {
    all: ['products'] as const,
    list: (filters: ProductsListFilters) => ['products', filters] as const,
    page: (filters: ProductsPageFilters) => ['products', 'page', filters] as const,
    listInfinite: (filters: Omit<ProductsPageFilters, 'page'>) => ['products', 'infinite', filters] as const,
    facets: (filters: Omit<ProductsPageFilters, 'page'>) => ['products', 'facets', filters] as const,
    summary: ['products', 'summary'] as const,
    detail: (id: string) => ['products', id] as const,
  },

  stock: {
    all: ['stock'] as const,
    movements: (filters: StockMovementsFilters) =>
      ['stock', 'movements', filters] as const,
    movementsInfinite: (filters: Omit<StockMovementsFilters, 'page'>) =>
      ['stock', 'movements', 'infinite', filters] as const,
    movementsAll: ['stock', 'movements'] as const,
    /** Carte « Derniers mouvements » de la fiche article (5, puis « Voir plus »). */
    productMovements: (productId: string) => ['stock', 'movements', 'product', productId] as const,
    levels: (filters: StockLevelsFilters) => ['stock', 'levels', filters] as const,
    levelsInfinite: (filters: Omit<StockLevelsFilters, 'page'>) =>
      ['stock', 'levels', 'infinite', filters] as const,
    levelsFacets: (filters: Omit<StockLevelsFilters, 'page' | 'ordering'>) =>
      ['stock', 'levels', 'facets', filters] as const,
    levelsSummary: ['stock', 'levels', 'summary'] as const,
  },

  search: {
    all: ['search'] as const,
    query: (q: string) => ['search', q] as const,
  },

  dashboard: {
    all: ['dashboard'] as const,
    today: ['dashboard', 'today'] as const,
    sales: (period: string) => ['dashboard', 'sales', period] as const,
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
    list: (scope: ReminderScope, filters: ReminderFilters) => ['reminders', 'list', scope, filters] as const,
    summary: (filters: ReminderFilters) => ['reminders', 'summary', filters] as const,
    assignees: ['reminders', 'assignees'] as const,
    settings: ['reminders', 'settings'] as const,
    followup: (customerId: string) => ['reminders', 'followup', customerId] as const,
    detail: (id: string) => ['reminders', 'detail', id] as const,
    linked: (link: 'customer' | 'order', id: string) => ['reminders', link, id] as const,
  },

  customers: {
    all: ['customers'] as const,
    list: (filters: CustomersListFilters) => ['customers', filters] as const,
    listInfinite: (filters: Omit<CustomersListFilters, 'page'>) => ['customers', 'infinite', filters] as const,
    summary: ['customers', 'summary'] as const,
    facets: (filters: Omit<CustomersListFilters, 'page'>) => ['customers', 'facets', filters] as const,
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
    /** Écran « Accès suspendu » : l'accès est-il revenu ? */
    access: ['me', 'access'] as const,
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

  messageTemplates: {
    all: ['message-templates'] as const,
    settings: (lang: string) => ['message-templates', 'settings', lang] as const,
    preview: (text: string, tone: string, lang: string) => ['message-templates', 'preview', text, tone, lang] as const,
    compose: (request: object, lang: string) => ['message-templates', 'compose', request, lang] as const,
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

  navBadges: {
    all: ['nav-badges'] as const,
  },
} as const;
