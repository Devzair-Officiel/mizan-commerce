import type { Quote, QuoteStatus } from '@/lib/hooks/useQuotes';

export const QUOTE_STATUS_DOT: Record<QuoteStatus, string> = {
  draft: 'bg-muted-foreground', sent: 'bg-amber-500', accepted: 'bg-green-500', declined: 'bg-red-500', expired: 'bg-muted-foreground', invoiced: 'bg-primary',
};
export const QUOTE_STATUS_BADGE: Record<QuoteStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  accepted: 'bg-green-500/10 text-green-700 dark:text-green-400',
  declined: 'bg-red-500/10 text-red-700 dark:text-red-400',
  expired: 'bg-muted text-muted-foreground',
  invoiced: 'bg-primary/10 text-primary',
};

/** Un brouillon s'ouvre dans l'éditeur, un devis envoyé sur sa page (provisoire en 6b, voir `quotes/[id]/page.tsx`). */
export const quoteHref = (q: Pick<Quote, 'id' | 'status'>) => q.status === 'draft' ? `/quotes/${q.id}/edit` : `/quotes/${q.id}`;
