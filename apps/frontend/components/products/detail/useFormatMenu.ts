'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, PowerOff, RotateCcw, Trash2 } from 'lucide-react';
import type { DetailAction, DetailMenuActions } from '@/components/detail/types';
import { ApiError } from '@/lib/api-client';
import {
  useDeleteProductVariant, useSetProductVariantActive, type ProductDetail, type ProductVariant,
} from '@/lib/hooks/useProducts';
import { notify } from '@/lib/notify';
import { activeFormats } from './productFormats';

/**
 * Menu « ⋯ » de chaque format : « Modifier », « Retirer de la vente » / « Remettre en vente », puis
 * « Supprimer » s'il n'a jamais servi. Le dernier format actif ne peut être ni retiré ni supprimé :
 * l'article deviendrait invendable (on désactive alors l'article).
 */
export function useFormatMenu(product: ProductDetail, openFormat: (variant: ProductVariant) => void) {
  const t = useTranslations('articles.sheet.format');
  const toggle = useSetProductVariantActive(product.id);
  const remove = useDeleteProductVariant(product.id);
  // Le format reste celui de la dernière confirmation : le texte ne change pas pendant la fermeture.
  const [confirm, setConfirm] = useState<{ variant: ProductVariant | null; open: boolean }>({ variant: null, open: false });
  const activeCount = activeFormats(product).length;

  function menuFor(v: ProductVariant): DetailMenuActions {
    const lastActive = v.is_active && activeCount <= 1;
    const items: DetailAction[] = [{ key: 'edit', icon: Pencil, label: t('edit'), onSelect: () => openFormat(v) }];
    if (!lastActive) {
      items.push({
        key: 'toggle', icon: v.is_active ? PowerOff : RotateCcw, label: t(v.is_active ? 'deactivate' : 'reactivate'),
        disabled: toggle.isPending, onSelect: () => toggle.mutate({ variantId: v.id, isActive: !v.is_active }, {
          onSuccess: () => notify.success(t(v.is_active ? 'deactivated' : 'reactivated')),
          onError: () => notify.error(t('save_failed')),
        }),
      });
    }
    const deletable = v.can_delete && !lastActive && product.variants.length > 1;
    const danger = deletable
      ? { key: 'delete', icon: Trash2, label: t('delete'), destructive: true, onSelect: () => setConfirm({ variant: v, open: true }) }
      : null;
    return { items, danger };
  }

  // La fenêtre de confirmation affiche l'erreur levée ici (409 : le format a servi entre-temps) et reste ouverte.
  async function runDelete() {
    if (!confirm.variant) return;
    await remove.mutateAsync(confirm.variant.id).catch((err: unknown) => {
      throw new Error(t(err instanceof ApiError && err.status === 409 ? 'delete_refused' : 'save_failed'));
    });
    notify.success(t('deleted'));
  }

  return {
    menuFor,
    confirm: { ...confirm, setOpen: (open: boolean) => setConfirm((c) => ({ ...c, open })), run: runDelete },
  };
}
