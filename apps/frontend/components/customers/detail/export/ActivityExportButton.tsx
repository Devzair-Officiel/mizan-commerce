'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import type { ActivityFilter } from '@/lib/hooks/useCustomers';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { HEADER_LINK } from '@/components/form/fieldStyles';
import { UpgradeCard } from '@/components/subscription/UpgradeCard';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ActivityExportDialog } from './ActivityExportDialog';

interface ActivityExportButtonProps {
  customerId: string;
  customerName: string;
  activityFilter: ActivityFilter;
  pendingOnly: boolean;
}

/**
 * « Exporter » dans la bande de la carte Activité : ouvre la fenêtre d'export, pré-réglée sur le filtre
 * affiché. En dessous de la formule Pro, le bouton reste là et ouvre la carte de mise à niveau, sans appel au serveur.
 */
export function ActivityExportButton({ customerId, customerName, activityFilter, pendingOnly }: ActivityExportButtonProps) {
  const t = useTranslations('customers.export');
  const [open, setOpen] = useState(false);
  const allowed = usePlanGating().can('exports');
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={HEADER_LINK}>
        <Download size={14} aria-hidden />
        {t('button')}
      </button>
      {open && !allowed && (
        <BottomSheet open onClose={() => setOpen(false)} title={t('title')} description={customerName}>
          <UpgradeCard feature="exports" />
        </BottomSheet>
      )}
      {open && allowed && (
        <ActivityExportDialog customerId={customerId} customerName={customerName} activityFilter={activityFilter}
          pendingOnly={pendingOnly} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
