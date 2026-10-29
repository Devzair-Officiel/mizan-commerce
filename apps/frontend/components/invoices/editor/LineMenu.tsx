'use client';

import { useTranslations } from 'next-intl';
import { ArrowUp, BookPlus, Copy, Trash2 } from 'lucide-react';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import type { DetailAction } from '@/components/detail/types';
import { draftError, useCreateProductFromLine } from '@/lib/hooks/useInvoiceDrafts';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { notify } from '@/lib/notify';
import { decimal, type EditorLine } from './editorSchema';

/** Gestes d'une ligne, tenus par la liste (`useFieldArray`). `moveUp` absent : première ligne. */
export interface LineActions {
  duplicate: () => void;
  moveUp?: () => void;
  remove: () => void;
}

interface LineMenuProps {
  index: number;
  line: EditorLine;
  actions: LineActions;
}

/**
 * « ⋯ » d'une ligne : enregistrer au catalogue (service créé avec son prix et son unité),
 * dupliquer, monter, supprimer (annulable). Menu ancré sur desktop, feuille du bas sur mobile.
 */
export function LineMenu({ index, line, actions }: LineMenuProps) {
  const t = useTranslations('invoices.editor.line');
  const isDesktop = useIsDesktop();
  const { mutateAsync: createProduct, isPending } = useCreateProductFromLine();
  const name = line.description.trim();

  const saveToCatalog = async () => {
    try {
      await createProduct({ name, unit_label: line.unit.trim(), unit_price_ht: decimal(line.unit_price_ht, 2) ?? '0' });
      notify.success(t('catalog_saved', { name }));
    } catch (err) {
      notify.error(t(draftError(err).code === 'product_name_taken' ? 'catalog_taken' : 'catalog_error', { name }));
    }
  };

  const items: DetailAction[] = [
    { key: 'catalog', icon: BookPlus, label: t('save_to_catalog'), onSelect: () => void saveToCatalog(), disabled: !name || isPending },
    { key: 'duplicate', icon: Copy, label: t('duplicate'), onSelect: actions.duplicate },
    { key: 'up', icon: ArrowUp, label: t('move_up'), onSelect: actions.moveUp, disabled: !actions.moveUp },
  ];
  const danger: DetailAction = { key: 'remove', icon: Trash2, label: t('remove'), onSelect: actions.remove, destructive: true };
  return <DetailActionsMenu actions={{ items, danger }} variant={isDesktop ? 'menu' : 'sheet'} label={t('more', { number: index + 1 })} compact />;
}
