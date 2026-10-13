'use client';

import { useTranslations } from 'next-intl';
import { Barcode, Hash, PowerOff, RotateCcw, Trash2 } from 'lucide-react';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import type { DetailAction } from '@/components/detail/types';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import type { FormatRowProps } from './formatRow';

/**
 * « ⋯ » d'une ligne : référence et code-barres ; pour un format enregistré, retrait de la vente et
 * suppression s'il n'a jamais servi ; pour une nouvelle ligne, sa suppression. La dernière ligne en
 * vente ne se retire ni ne se supprime. Menu ancré sur desktop, fenêtre du bas sur mobile.
 */
export function FormatMenu({ index, formats, variant, label }: Pick<FormatRowProps, 'index' | 'formats' | 'variant' | 'label'>) {
  const t = useTranslations('articles.form');
  const isDesktop = useIsDesktop();
  const active = formats.rows[index]?.is_active ?? true;
  const locked = formats.isLastActive(index);
  const items: DetailAction[] = [
    { key: 'sku', icon: Hash, label: t('sku'), onSelect: () => formats.setReferences({ index, field: 'sku' }) },
    { key: 'barcode', icon: Barcode, label: t('barcode'), onSelect: () => formats.setReferences({ index, field: 'barcode' }) },
  ];
  if (variant) {
    items.push({
      key: 'toggle', icon: active ? PowerOff : RotateCcw, label: t(active ? 'format_deactivate' : 'format_reactivate'),
      onSelect: () => formats.toggleActive(index), disabled: locked,
    });
  }
  const removable = !variant || variant.can_delete;
  const danger: DetailAction | null = removable
    ? { key: 'remove', icon: Trash2, label: t(variant ? 'format_delete' : 'format_remove'), onSelect: () => formats.remove(index), destructive: true, disabled: locked }
    : null;

  return <DetailActionsMenu actions={{ items, danger }} variant={isDesktop ? 'menu' : 'sheet'} label={t('format_more', { name: label })} compact />;
}
