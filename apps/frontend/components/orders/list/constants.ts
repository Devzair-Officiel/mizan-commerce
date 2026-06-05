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

export type PaymentKey = 'unpaid' | 'partial' | 'paid';

export const PAYMENT_COLOR: Record<string, string> = {
  unpaid:  'text-red-500 dark:text-red-400',
  partial: 'text-amber-600 dark:text-amber-400',
  paid:    'text-green-600 dark:text-green-400',
};

export type StatusFilterKey = '' | 'draft' | 'to_prepare' | 'prepared' | 'shipped' | 'cancelled';

export const STATUSES: { value: StatusFilterKey; labelKey: 'all' | 'draft' | 'to_prepare' | 'prepared' | 'shipped' | 'cancelled'; dot: string | null; activeClass: string }[] = [
  { value: '',           labelKey: 'all',        dot: null,           activeClass: 'bg-foreground text-background' },
  { value: 'draft',      labelKey: 'draft',      dot: 'bg-zinc-400',  activeClass: 'bg-zinc-500 text-white' },
  { value: 'to_prepare', labelKey: 'to_prepare', dot: 'bg-blue-500',  activeClass: 'bg-blue-600 text-white' },
  { value: 'prepared',   labelKey: 'prepared',   dot: 'bg-amber-500', activeClass: 'bg-amber-500 text-white' },
  { value: 'shipped',    labelKey: 'shipped',    dot: 'bg-green-500', activeClass: 'bg-green-600 text-white' },
  { value: 'cancelled',  labelKey: 'cancelled',  dot: 'bg-red-500',   activeClass: 'bg-red-600 text-white' },
];

export const BUCKET_ORDER: Bucket[] = ['today', 'yesterday', 'this_week', 'older'];
