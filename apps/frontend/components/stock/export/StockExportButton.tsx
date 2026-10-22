'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { UpgradeSheet } from '@/components/subscription/UpgradeSheet';
import { useStockLevelsState } from '@/components/stock/levels/useStockLevelsState';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { cn } from '@/lib/utils';
import { StockExportDialog } from './StockExportDialog';

/**
 * « Exporter » dans l'en-tête du Stock (onglet Niveaux) : contour avec libellé sur desktop, icône de
 * 44px sur mobile, à la hauteur des actions voisines. En dessous de la formule Boutique, il ouvre la
 * carte de mise à niveau, sans appel au serveur. Filtre, recherche et tri : ceux de la liste (URL).
 */
export function StockExportButton() {
  const t = useTranslations('stock.export');
  const tExport = useTranslations('export');
  const [open, setOpen] = useState(false);
  const allowed = usePlanGating().can('exports');
  const { state, search, ordering } = useStockLevelsState();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={cn(buttonVariants({ variant: 'outline' }), 'hidden h-10 rounded-full px-4 text-sm lg:inline-flex')}>
        <Download aria-hidden />
        {tExport('button')}
      </button>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('button_label')}
        className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-11 rounded-full lg:hidden')}>
        <Download className="size-5" aria-hidden />
      </button>
      <UpgradeSheet open={open && !allowed} onClose={() => setOpen(false)} feature="exports" title={t('title')} />
      {open && allowed && <StockExportDialog levels={{ state, search, ordering }} onClose={() => setOpen(false)} />}
    </>
  );
}
