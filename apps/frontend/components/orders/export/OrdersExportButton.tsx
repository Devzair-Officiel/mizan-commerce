'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { UpgradeSheet } from '@/components/subscription/UpgradeSheet';
import type { OrdersPageState } from '@/components/orders/list/useOrdersPageState';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { cn } from '@/lib/utils';
import { OrdersExportDialog } from './OrdersExportDialog';

/**
 * « Exporter » dans l'en-tête de Commandes : contour avec libellé sur desktop, icône de 44px sur
 * mobile. En dessous de la formule Boutique, il ouvre la carte de mise à niveau, sans appel au serveur.
 */
export function OrdersExportButton({ state }: { state: OrdersPageState }) {
  const t = useTranslations('orders.export');
  const [open, setOpen] = useState(false);
  const allowed = usePlanGating().can('exports');
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={cn(buttonVariants({ variant: 'outline' }), 'hidden h-11 rounded-full px-4 text-sm lg:inline-flex')}>
        <Download aria-hidden />
        {t('button')}
      </button>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('button_label')}
        className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-11 rounded-full lg:hidden')}>
        <Download className="size-5" aria-hidden />
      </button>
      <UpgradeSheet open={open && !allowed} onClose={() => setOpen(false)} feature="exports" title={t('title')} />
      {open && allowed && <OrdersExportDialog state={state} onClose={() => setOpen(false)} />}
    </>
  );
}
