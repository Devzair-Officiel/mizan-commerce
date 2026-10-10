export const PAYMENT_TITLE_KEY: Record<string, 'payment_unpaid' | 'payment_partial' | 'payment_paid'> = {
  unpaid:  'payment_unpaid',
  partial: 'payment_partial',
  paid:    'payment_paid',
};

export const PAYMENT_TONE: Record<string, string> = {
  unpaid:  'bg-red-500/10 text-red-500 dark:text-red-400',
  partial: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  paid:    'bg-green-500/10 text-green-600 dark:text-green-400',
};

export function getInitials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
