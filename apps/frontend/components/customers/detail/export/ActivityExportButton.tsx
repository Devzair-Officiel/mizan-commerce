'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import type { ActivityFilter } from '@/lib/hooks/useCustomers';
import { HEADER_LINK } from '@/components/form/fieldStyles';
import { ActivityExportDialog } from './ActivityExportDialog';

interface ActivityExportButtonProps {
  customerId: string;
  customerName: string;
  activityFilter: ActivityFilter;
  pendingOnly: boolean;
}

/** « Exporter » dans la bande de la carte Activité : ouvre la fenêtre d'export, pré-réglée sur le filtre affiché. */
export function ActivityExportButton({ customerId, customerName, activityFilter, pendingOnly }: ActivityExportButtonProps) {
  const t = useTranslations('customers.export');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={HEADER_LINK}>
        <Download size={14} aria-hidden />
        {t('button')}
      </button>
      {open && (
        <ActivityExportDialog customerId={customerId} customerName={customerName} activityFilter={activityFilter}
          pendingOnly={pendingOnly} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
