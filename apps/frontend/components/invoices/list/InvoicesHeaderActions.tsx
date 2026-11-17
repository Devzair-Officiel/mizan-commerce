'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ListCreateButton } from '@/components/list/ListCreateButton';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Actions de l'en-tête des factures : lien « Devis » (contour, avec libellé à toutes les tailles :
 * une icône seule y serait ambiguë) et « Nouvelle facture ». Les devis n'ont pas d'entrée de navigation.
 */
export function InvoicesHeaderActions() {
  const t = useTranslations('invoices.list');
  return <div className="flex items-center gap-2">
    <Link href="/quotes" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 rounded-full px-4 text-sm')}>{t('quotes_link')}</Link>
    <ListCreateButton href="/invoices/new" label={t('create')} />
  </div>;
}
