'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileText } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { ExportFooter } from '@/components/export/ExportFooter';
import { ExportFormatField } from '@/components/export/ExportFormatField';
import { ExportRowsBox } from '@/components/export/ExportRowsBox';
import { ExportWhatsAppLimit } from '@/components/export/ExportWhatsAppLimit';
import { useExportActions } from '@/components/export/useExportActions';
import { useCustomer, type ActivityFilter } from '@/lib/hooks/useCustomers';
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

/** Pied du CSV : le fichier de l'activité, téléchargé par un lien (voir `useActivityExportForm`). */
function CsvFooter({ formId, disabled, onClose }: { formId: string; disabled: boolean; onClose: () => void }) {
  const t = useTranslations('customers.export');
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button type="button" variant="ghost" onClick={onClose} className="h-11 rounded-full px-4 lg:h-10">{t('cancel')}</Button>
      <Button type="submit" form={formId} disabled={disabled}
        className="h-11 flex-1 gap-1.5 rounded-full px-4 font-semibold lg:h-10 lg:flex-none">
        <Download size={17} aria-hidden />
        {t('download')}
      </Button>
    </div>
  );
}

/**
 * Contenu fixe du relevé (PDF, message), à la place des cases : jamais les notes, réservées au CSV.
 * Une ligne, sans libellé au-dessus, pour tenir à 360×640.
 */
function StatementContent({ format }: { format: 'pdf' | 'whatsapp' }) {
  const t = useTranslations('customers.export');
  return (
    <p className="text-[0.8125rem] font-medium text-foreground">
      {t.rich('statement_content', { format, muted: (chunks) => <span className="font-normal text-muted-foreground">{chunks}</span> })}
    </p>
  );
}

/**
 * « Exporter l'activité » : format, contenu, période, puis le fichier CSV de l'activité, ou le relevé
 * de compte en PDF ou en message (une ligne par commande). À monter à l'ouverture.
 */
export function ActivityExportDialog({ customerId, customerName, activityFilter, pendingOnly, onClose }: ActivityExportDialogProps) {
  const t = useTranslations('customers.export');
  const formId = useId();
  const {
    form, format, period, due, keptList, counts, rows, query, summary, registerFormat, switchKeepingList, submitCsv,
  } = useActivityExportForm({ customerId, activityFilter, pendingOnly, onDone: onClose });
  const phone = useCustomer(customerId).data?.phone;
  const actions = useExportActions({ target: { kind: 'statement', customerId }, format, query, phone, onDone: onClose });
  const { register, formState: { errors } } = form;
  const csv = format === 'csv';
  const overCap = format === 'pdf' && !!summary && summary.rows > summary.pdf_max_rows;
  // Message tronqué : l'avertissement remplace la description du format et le nombre de commandes.
  const truncated = format === 'whatsapp' && summary && summary.rows > summary.whatsapp_max_rows ? summary : null;

  return (
    <BottomSheet open onClose={onClose} title={t('title')} description={customerName} footer={csv
      ? <CsvFooter formId={formId} disabled={rows === 0} onClose={onClose} />
      : <ExportFooter formId={formId} actions={actions} disabled={summary?.rows === 0 || overCap} onClose={onClose} />
    }>
      <form id={formId} noValidate onSubmit={csv ? submitCsv : form.handleSubmit(actions.run)} className="flex flex-col gap-4.5">
        <ExportFormatField kind="statement" register={registerFormat} format={format} notice={truncated && (
          <ExportWhatsAppLimit kind="statement" summary={truncated} actions={actions}
            onShareBundle={() => void form.handleSubmit(actions.prepareBundle)()} onUseFormat={switchKeepingList} />
        )} />
        {csv ? <ExportTypeOptions register={register} counts={counts} error={errors.types?.message} /> : <StatementContent format={format} />}
        <ExportPeriodField register={register} period={period} error={errors.to?.message} />
        {due && format !== 'whatsapp' && (
          <p className="text-[0.8125rem] text-muted-foreground">{t('pending_note', { source: pendingOnly || !keptList ? 'activity' : 'message' })}</p>
        )}
        {csv ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-muted px-3.5 py-3 text-[0.8125rem] text-foreground">
            <FileText size={18} aria-hidden className="shrink-0 text-muted-foreground" />
            <p aria-live="polite">
              {t.rich('format', { b: (chunks) => <b className="font-semibold">{chunks}</b> })}
              {rows !== undefined && <span className="text-muted-foreground"> {t('rows', { count: rows })}</span>}
            </p>
          </div>
        ) : (!truncated || actions.text !== null) && (
          <ExportRowsBox kind="statement" format={format} summary={summary} preview={actions.text}
            onUseCsv={() => form.setValue('format', 'csv')} />
        )}
      </form>
    </BottomSheet>
  );
}
