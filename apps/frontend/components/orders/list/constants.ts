export type Bucket = 'today' | 'yesterday' | 'this_week' | 'older';

export const STATUS_BAR: Record<string, string> = {
  draft:      'bg-zinc-300 dark:bg-zinc-600',
  to_prepare: 'bg-blue-500',
  prepared:   'bg-amber-500',
  shipped:    'bg-green-500',
  cancelled:  'bg-red-500',
};

export const STATUS_TEXT: Record<string, string> = {
  draft:      'text-muted-foreground',
  to_prepare: 'text-blue-700 dark:text-blue-400',
  prepared:   'text-amber-700 dark:text-amber-400',
  shipped:    'text-green-700 dark:text-green-400',
  cancelled:  'text-red-600 dark:text-red-400',
};

export const PAYMENT_LABEL: Record<string, string> = {
  unpaid:  'Non payé',
  partial: 'Partiel',
  paid:    'Payé',
};

export const PAYMENT_COLOR: Record<string, string> = {
  unpaid:  'text-red-500 dark:text-red-400',
  partial: 'text-amber-600 dark:text-amber-400',
  paid:    'text-green-600 dark:text-green-400',
};

export const STATUSES: { value: string; label: string; dot: string | null; activeClass: string }[] = [
  { value: '',           label: 'Toutes',     dot: null,           activeClass: 'bg-foreground text-background' },
  { value: 'draft',      label: 'Brouillons', dot: 'bg-zinc-400',  activeClass: 'bg-zinc-500 text-white' },
  { value: 'to_prepare', label: 'À préparer', dot: 'bg-blue-500',  activeClass: 'bg-blue-600 text-white' },
  { value: 'prepared',   label: 'Prêtes',     dot: 'bg-amber-500', activeClass: 'bg-amber-500 text-white' },
  { value: 'shipped',    label: 'Expédiées',  dot: 'bg-green-500', activeClass: 'bg-green-600 text-white' },
  { value: 'cancelled',  label: 'Annulées',   dot: 'bg-red-500',   activeClass: 'bg-red-600 text-white' },
];

export const BUCKET_LABEL: Record<Bucket, string> = {
  today:     "Aujourd'hui",
  yesterday: 'Hier',
  this_week: 'Cette semaine',
  older:     'Plus ancien',
};

export const BUCKET_ORDER: Bucket[] = ['today', 'yesterday', 'this_week', 'older'];
