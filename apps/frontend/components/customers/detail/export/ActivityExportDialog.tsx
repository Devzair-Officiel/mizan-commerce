'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileText } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import type { ActivityFilter } from '@/lib/hooks/useCustomers';
import { ExportPeriodField } from './ExportPeriodField';
import { ExportTypeOptions } from './ExportTypeOptions';
import { useActivityExportForm } from './useActivityExportForm';

interface ActivityExportDialogProps {
  customerId: string;
  customerName: string;
  activityFilter: ActivityFilter;
  /** « À encaisser » actif sur la carte : l'export s'y limite aussi. */
  pendingOnly: boolean;
  onClose: () => void;
}

/** « Exporter l'activité » : contenu, période, puis le fichier CSV. À monter à l'ouverture. */
export function ActivityExportDialog({ customerId, customerName, activityFilter, pendingOnly, onClose }: ActivityExportDialogProps) {
  const t = useTranslations('customers.export');
  const formId = useId();
  const { form, period, counts, rows, submit } = useActivityExportForm({ customerId, activityFilter, pendingOnly, onDone: onClose });
  const { register, formState: { errors } } = form;

  return (
    <BottomSheet open onClose={onClose} title={t('title')} description={customerName} footer={
      <div className="flex items-center justify-end gap-1.5">
        <Button type="button" variant="ghost" onClick={onClose} className="h-11 rounded-full px-4 lg:h-10">{t('cancel')}</Button>
        <Button type="submit" form={formId} disabled={rows === 0}
          className="h-11 flex-1 gap-1.5 rounded-full px-4 font-semibold lg:h-10 lg:flex-none">
          <Download size={17} aria-hidden />
          {t('download')}
        </Button>
      </div>
    }>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4.5">
        <ExportTypeOptions register={register} counts={counts} error={errors.types?.message} />
        <ExportPeriodField register={register} period={period} error={errors.to?.message} />
        {pendingOnly && <p className="text-[0.8125rem] text-muted-foreground">{t('pending_note')}</p>}
        <div className="flex items-center gap-2.5 rounded-xl bg-muted px-3.5 py-3 text-[0.8125rem] text-foreground">
          <FileText size={18} aria-hidden className="shrink-0 text-muted-foreground" />
          <p aria-live="polite">
            {t.rich('format', { b: (chunks) => <b className="font-semibold">{chunks}</b> })}
            {rows !== undefined && <span className="text-muted-foreground"> {t('rows', { count: rows })}</span>}
          </p>
        </div>
      </form>
    </BottomSheet>
  );
}
