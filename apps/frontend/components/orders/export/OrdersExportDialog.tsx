'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCustomer } from '@/lib/hooks/useCustomers';
import { useOrderFilterOptions } from '@/components/orders/list/useOrderFilterOptions';
import type { OrdersPageState } from '@/components/orders/list/useOrdersPageState';
import { ExportFooter } from '@/components/export/ExportFooter';
import { ExportFormatField } from '@/components/export/ExportFormatField';
import { ExportRowsBox } from '@/components/export/ExportRowsBox';
import { ExportWhatsAppLimit } from '@/components/export/ExportWhatsAppLimit';
import { useExportActions } from '@/components/export/useExportActions';
import { ExportPeriodField } from './ExportPeriodField';
import { useOrdersExportForm } from './useOrdersExportForm';

/** Filtres de la liste repris par l'export, en clair (sous le titre). */
function useScope(state: OrdersPageState): string {
  const t = useTranslations('orders.export');
  const tPay = useTranslations('orders.paymentFilter');
  const { statusLabel } = useOrderFilterOptions();
  const { data: customer } = useCustomer(state.customer);
  const parts = [
    state.statusFilter && statusLabel(state.statusFilter),
    state.paymentFilter !== 'all' && tPay(state.paymentFilter),
    state.customer && customer?.display_name,
    state.search && t('search', { query: state.search }),
  ].filter((part): part is string => !!part);
  return parts.length ? t('scope_filtered', { filters: parts.join(' · ') }) : t('scope_all');
}

/** « Exporter les commandes » : format, période, puis le fichier ou le message. À monter à l'ouverture. */
export function OrdersExportDialog({ state, onClose }: { state: OrdersPageState; onClose: () => void }) {
  const t = useTranslations('orders.export');
  const formId = useId();
  const scope = useScope(state);
  const { form, format, period, query, summary } = useOrdersExportForm(state.filters);
  const actions = useExportActions({ kind: 'orders', format, query, onDone: onClose });
  const { register, setValue, formState: { errors } } = form;
  const overCap = format === 'pdf' && !!summary && summary.rows > summary.pdf_max_rows;
  // Message tronqué : l'avertissement remplace la description du format et le nombre de commandes.
  const truncated = format === 'whatsapp' && summary && summary.rows > summary.whatsapp_max_rows ? summary : null;

  return (
    <BottomSheet open onClose={onClose} title={t('title')} description={scope} footer={
      <ExportFooter formId={formId} actions={actions} disabled={summary?.rows === 0 || overCap} onClose={onClose} />
    }>
      <form id={formId} noValidate onSubmit={form.handleSubmit(actions.run)} className="flex flex-col gap-4">
        <ExportFormatField kind="orders" register={register('format')} format={format} notice={truncated && (
          <ExportWhatsAppLimit kind="orders" summary={truncated} actions={actions}
            onShareBundle={() => void form.handleSubmit(actions.prepareBundle)()}
            onUseFormat={(value) => setValue('format', value)} />
        )} />
        <ExportPeriodField register={register} period={period} error={errors.to?.message} />
        {(!truncated || actions.text !== null) && (
          <ExportRowsBox kind="orders" format={format} summary={summary} preview={actions.text}
            onUseCsv={() => setValue('format', 'csv')} />
        )}
      </form>
    </BottomSheet>
  );
}
