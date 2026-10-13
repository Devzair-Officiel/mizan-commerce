'use client';

import { useTranslations } from 'next-intl';
import { Clock, UserPlus, Users } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { useCustomersSummary } from '@/lib/hooks/useCustomers';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { CustomersStatCardKey } from './useCustomersPageState';

interface CustomersStatCardsProps {
  currency: string;
  active: Record<CustomersStatCardKey, boolean>;
  onToggle: (card: CustomersStatCardKey) => void;
}

/**
 * Indicateurs de la page Clients : chacun bascule son filtre. 3 colonnes sur
 * desktop ; 2 sur mobile, la dernière carte sur toute la largeur.
 */
export function CustomersStatCards({ currency, active, onToggle }: CustomersStatCardsProps) {
  const t = useTranslations('customers.list.stats');
  const formatMoney = useFormatMoney();
  const { data } = useCustomersSummary();

  if (!data) return <div className="h-72 lg:h-32.5" aria-hidden />;

  return (
    <div className="grid grid-cols-2 gap-3 max-lg:*:last:odd:col-span-2 lg:grid-cols-3 lg:gap-4">
      <StatCard
        label={t('active_label')}
        value={data.active.count}
        icon={<Users size={16} />}
        onClick={() => onToggle('active')}
        pressed={active.active}
      />
      <StatCard
        label={t('due_label')}
        value={formatMoney(data.due.amount, currency)}
        sub={t('due_sub', { count: data.due.count })}
        icon={<Clock size={16} />}
        tone="amber"
        toneValue
        onClick={() => onToggle('due')}
        pressed={active.due}
      />
      <StatCard
        label={t('new_label')}
        value={data.new_this_month.count}
        icon={<UserPlus size={16} />}
        tone="green"
        onClick={() => onToggle('new')}
        pressed={active.new}
      />
    </div>
  );
}
