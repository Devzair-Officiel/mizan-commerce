'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Pencil } from 'lucide-react';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import { DetailPrimaryButton } from '@/components/detail/DetailPrimaryButton';
import type { DetailAction, DetailMenuActions } from '@/components/detail/types';
import { buttonVariants } from '@/components/ui/button';
import type { Customer } from '@/lib/hooks/useCustomers';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { cn } from '@/lib/utils';
import { CustomerStatusBadges } from './CustomerStatusBadges';

interface CustomerDetailHeaderProps {
  customer: Customer;
  primary: DetailAction | null;
  menu: DetailMenuActions;
}

/** En-tête desktop : retour, nom + badges, ancienneté ; à droite Modifier, « ⋯ », action principale. */
export function CustomerDetailHeader({ customer, primary, menu }: CustomerDetailHeaderProps) {
  const t = useTranslations('customers.detail');
  const tNav = useTranslations('layout.nav');
  const router = useRouter();
  const formatDate = useFormatDate();
  // Retour à la liste avec ses filtres (historique), ou à la liste nue si on arrive d'ailleurs.
  const back = () => (window.history.length > 1 ? router.back() : router.push('/customers'));

  return (
    <header className="hidden flex-wrap items-end justify-between gap-4 px-4 pt-2 lg:flex">
      <div className="min-w-0">
        <button type="button" onClick={back}
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft size={16} className="rtl:rotate-180" aria-hidden />
          {tNav('customers')}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold leading-snug tracking-tight capitalize">{customer.name}</h1>
          <CustomerStatusBadges customer={customer} />
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t('since', { date: formatDate(customer.created_at, { month: 'long', year: 'numeric' }) })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/customers/${customer.id}/edit`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 rounded-full bg-card px-4 font-medium')}>
          <Pencil aria-hidden />{t('edit')}
        </Link>
        <DetailActionsMenu actions={menu} variant="menu" />
        {primary && <DetailPrimaryButton action={primary} />}
      </div>
    </header>
  );
}
