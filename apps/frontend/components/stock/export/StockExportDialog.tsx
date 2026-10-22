'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ExportFooter } from '@/components/export/ExportFooter';
import { ExportFormatField } from '@/components/export/ExportFormatField';
import { ExportRowsBox } from '@/components/export/ExportRowsBox';
import { ExportWhatsAppLimit } from '@/components/export/ExportWhatsAppLimit';
import { useExportActions } from '@/components/export/useExportActions';
import type { StockLevelsPageState } from '@/components/stock/levels/useStockLevelsState';
import { ExportScopeField } from './ExportScopeField';
import { useStockExportForm } from './useStockExportForm';

interface StockExportDialogProps {
  levels: Pick<StockLevelsPageState, 'state' | 'search' | 'ordering'>;
  onClose: () => void;
}

/**
 * « Exporter le stock » : format, périmètre, puis le fichier ou le message. Reprend la recherche et
 * le tri de la liste ; son filtre d'état pré-choisit le périmètre. À monter à l'ouverture.
 */
export function StockExportDialog({ levels, onClose }: StockExportDialogProps) {
  const t = useTranslations('stock.export');
  const formId = useId();
  const { form, format, query, summary, registerFormat, switchKeepingList } = useStockExportForm(levels);
  const actions = useExportActions({ target: { kind: 'stock' }, format, query, onDone: onClose });
  const overCap = format === 'pdf' && !!summary && summary.rows > summary.pdf_max_rows;
  // Message tronqué : l'avertissement remplace la description du format et le nombre de formats.
  const truncated = format === 'whatsapp' && summary && summary.rows > summary.whatsapp_max_rows ? summary : null;
  const description = levels.search ? t('scope_search', { query: levels.search }) : t('scope_all');

  return (
    <BottomSheet open onClose={onClose} title={t('title')} description={description} footer={
      <ExportFooter formId={formId} actions={actions} disabled={summary?.rows === 0 || overCap} onClose={onClose} />
    }>
      <form id={formId} noValidate onSubmit={form.handleSubmit(actions.run)} className="flex flex-col gap-4">
        <ExportFormatField kind="stock" register={registerFormat} format={format} notice={truncated && (
          <ExportWhatsAppLimit kind="stock" summary={truncated} actions={actions}
            onShareBundle={() => void form.handleSubmit(actions.prepareBundle)()} onUseFormat={switchKeepingList} />
        )} />
        <ExportScopeField register={form.register('scope')} locked={format === 'whatsapp'} />
        {(!truncated || actions.text !== null) && (
          <ExportRowsBox kind="stock" format={format} summary={summary} preview={actions.text}
            onUseCsv={() => form.setValue('format', 'csv')} />
        )}
      </form>
    </BottomSheet>
  );
}
