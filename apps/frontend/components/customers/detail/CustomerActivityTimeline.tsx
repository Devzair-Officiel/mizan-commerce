'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { History } from 'lucide-react';
import { useCustomerActivity, type ActivityType } from '@/lib/hooks/useCustomers';
import { SectionCard } from '@/components/ui/SectionCard';
import { ShowMoreList } from '@/components/ui/ShowMoreList';
import { ActivityRow, ActivitySkeletonRow } from './ActivityRow';

interface CustomerActivityTimelineProps {
  customerId: string;
  activityFilter: ActivityType | null;
  pendingOnly: boolean;
  onFilterChange: (filter: ActivityType | null) => void;
  /** Étiquette « À encaisser » (client avec un reste à payer) : n'affiche que les commandes dues. */
  onTogglePending?: () => void;
}

export function CustomerActivityTimeline({
  customerId, activityFilter, pendingOnly, onFilterChange, onTogglePending,
}: CustomerActivityTimelineProps) {
  const t = useTranslations('customers.timeline');
  // Une puce change la clé de la requête : la liste repart de 5 éléments.
  const activity = useCustomerActivity(customerId, activityFilter, pendingOnly);

  const chips = useMemo<{ key: ActivityType | null; label: string }[]>(
    () => [
      { key: null,       label: t('chip_all') },
      { key: 'order',    label: t('chip_orders') },
      { key: 'payment',  label: t('chip_payments') },
      { key: 'shipment', label: t('chip_shipments') },
      { key: 'note',     label: t('chip_notes') },
    ],
    [t],
  );

  const totalCount = activity.count;

  return (
    <SectionCard title={t('title')}
      rightSlot={totalCount > 0 ? <span className="text-muted-foreground tabular-nums">{totalCount}</span> : undefined}>
      <div className="overflow-x-auto px-4 py-3 lg:px-5">
        <div className="flex gap-2 w-max">
          {chips.map(({ key, label }) => {
            const active = activityFilter === key;
            return (
              <button
                key={String(key)}
                type="button"
                onClick={() => onFilterChange(key)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground active:bg-muted/70'
                }`}
              >
                {label}
              </button>
            );
          })}
          {onTogglePending && (
            <button type="button" aria-pressed={pendingOnly} onClick={onTogglePending}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                pendingOnly ? 'bg-amber-500 text-amber-950' : 'bg-amber-400/15 text-amber-700 dark:text-amber-300'
              }`}>
              {t('chip_pending')}
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-border">
        {activity.isLoading ? (
          <div className="flex flex-col divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <ActivitySkeletonRow key={i} />
            ))}
          </div>
        ) : !activity.items.length ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <History size={20} />
            </div>
            <p className="text-sm font-medium text-foreground">{t('empty_title')}</p>
            <p className="text-xs text-muted-foreground">{t('empty_sub')}</p>
          </div>
        ) : (
          <ShowMoreList list={activity} kind="activities">
            <div className="flex flex-col divide-y divide-border">
              {activity.items.map((item) => (
                <ActivityRow key={item.id} item={item} customerId={customerId} />
              ))}
            </div>
          </ShowMoreList>
        )}
      </div>
    </SectionCard>
  );
}
