'use client';

import type { UseFormRegisterReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { SegmentedField } from '@/components/export/SegmentedField';
import { STOCK_EXPORT_SCOPES } from './useStockExportForm';

interface ExportScopeFieldProps {
  register: UseFormRegisterReturn<'scope'>;
  /** Message WhatsApp : « À réapprovisionner » imposé, « Tout le stock » visible mais désactivé. */
  locked: boolean;
}

/** « Périmètre » de l'export du stock, à la place de la période des commandes. */
export function ExportScopeField({ register, locked }: ExportScopeFieldProps) {
  const t = useTranslations('stock.export');
  const options = STOCK_EXPORT_SCOPES.map((value) => ({
    value, label: t('scope', { scope: value }), disabled: locked && value === 'all',
  }));
  return <SegmentedField label={t('scope_label')} options={options} register={register} columns="grid-cols-2" />;
}
