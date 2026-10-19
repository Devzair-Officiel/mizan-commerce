'use client';

import { useTranslations } from 'next-intl';
import type { FollowUpItem } from '@/lib/hooks/useZakatFollowUps';
import { cn } from '@/lib/utils';

/** État d'une créance suivie : ambre quand il reste un geste à faire, vert une fois versée. */
export function FollowUpStateBadge({ item }: { item: FollowUpItem }) {
  const t = useTranslations('zakat.followup.state');
  let key: string = item.state;
  if (item.state === 'cancelled' && item.order_state === 'removed') key = 'removed';
  if (item.state === 'nothing_due' && item.below_nisab) key = 'below_nisab';
  const tone = item.state === 'to_pay' || item.state === 'choice_needed' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
    : item.state === 'paid' ? 'bg-secondary text-secondary-foreground'
    : 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex h-5.5 shrink-0 items-center rounded-full px-2 text-[0.71875rem] font-semibold whitespace-nowrap', tone)}>
      {t(key)}
    </span>
  );
}
