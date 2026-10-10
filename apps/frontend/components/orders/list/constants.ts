export type Bucket = 'today' | 'yesterday' | 'this_week' | 'older';

/** Couleur de chaque statut : source unique pour le tableau, les menus et la liste mobile. */
export const STATUS_BAR: Record<string, string> = {
  to_prepare: 'bg-amber-500',
  prepared:   'bg-primary',
  shipped:    'bg-green-500',
  cancelled:  'bg-red-500',
};

export const STATUS_TEXT: Record<string, string> = {
  to_prepare: 'text-amber-700 dark:text-amber-400',
  prepared:   'text-primary',
  shipped:    'text-green-700 dark:text-green-400',
  cancelled:  'text-red-600 dark:text-red-400',
};

export type PaymentKey = 'unpaid' | 'partial' | 'paid';

/** Badge de paiement : colonne Paiement du tableau et menu Paiement. */
export const PAYMENT_BADGE: Record<string, string> = {
  unpaid:  'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  partial: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  paid:    'bg-green-500/10 text-green-700 dark:text-green-400',
};

export const PAYMENT_COLOR: Record<string, string> = {
  unpaid:  'text-red-500 dark:text-red-400',
  partial: 'text-amber-600 dark:text-amber-400',
  paid:    'text-green-600 dark:text-green-400',
};

export type StatusFilterKey = '' | 'to_prepare' | 'prepared' | 'shipped' | 'cancelled';

export const STATUSES: { value: StatusFilterKey; labelKey: 'all' | 'to_prepare' | 'prepared' | 'shipped' | 'cancelled'; activeClass: string }[] = [
  { value: '',           labelKey: 'all',        activeClass: 'bg-secondary text-secondary-foreground' },
  { value: 'to_prepare', labelKey: 'to_prepare', activeClass: 'bg-secondary text-secondary-foreground' },
  { value: 'prepared',   labelKey: 'prepared',   activeClass: 'bg-secondary text-secondary-foreground' },
  { value: 'shipped',    labelKey: 'shipped',    activeClass: 'bg-secondary text-secondary-foreground' },
  { value: 'cancelled',  labelKey: 'cancelled',  activeClass: 'bg-secondary text-secondary-foreground' },
];

export const BUCKET_ORDER: Bucket[] = ['today', 'yesterday', 'this_week', 'older'];
