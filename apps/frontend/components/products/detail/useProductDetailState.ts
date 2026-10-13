'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { QuickEntryVariant } from '@/components/stock/quick-entry/QuickEntryForm';
import { ApiError } from '@/lib/api-client';
import {
  useDeactivateProduct, useDeleteProduct, useReactivateProduct, type ProductDetail, type ProductVariant,
} from '@/lib/hooks/useProducts';
import { notify } from '@/lib/notify';
import { quickEntryOf } from './productFormats';

/** Format ouvert dans la fenêtre : nouveau, ou format existant à modifier. */
export type FormatDialogTarget = ProductVariant | 'new' | null;

/** Gestes de la fiche, appelés par l'action principale, le menu « ⋯ » et les cartes. */
export interface ProductDetailActions {
  openEntry: (variant: ProductVariant) => void;
  openFormat: (target: Exclude<FormatDialogTarget, null>) => void;
  confirmDeactivate: () => void;
  confirmDelete: () => void;
  reactivate: () => void;
  pending: boolean;
}

/** État de la fiche article : entrée rapide, fenêtre de format, désactivation et suppression. */
export function useProductDetailState(product: ProductDetail) {
  const t = useTranslations('articles.sheet');
  const router = useRouter();
  const deactivate = useDeactivateProduct();
  const reactivate = useReactivateProduct();
  const remove = useDeleteProduct();
  const [entry, setEntry] = useState<QuickEntryVariant | null>(null);
  const [format, setFormat] = useState<FormatDialogTarget>(null);
  // Le type reste celui de la dernière confirmation : le texte ne change pas pendant la fermeture.
  const [confirm, setConfirm] = useState<{ kind: 'deactivate' | 'delete'; open: boolean }>({ kind: 'deactivate', open: false });
  const values = { type: product.type };

  const actions: ProductDetailActions = {
    openEntry: (variant) => setEntry(quickEntryOf(product, variant)),
    openFormat: setFormat,
    confirmDeactivate: () => setConfirm({ kind: 'deactivate', open: true }),
    confirmDelete: () => setConfirm({ kind: 'delete', open: true }),
    reactivate: () => reactivate.mutate(product.id, {
      onSuccess: () => notify.success(t('reactivated', values)),
      onError: () => notify.error(t('action_failed')),
    }),
    pending: deactivate.isPending || reactivate.isPending || remove.isPending,
  };

  // Les fenêtres de confirmation affichent l'erreur levée ici et restent ouvertes.
  async function confirmDeactivate() {
    await deactivate.mutateAsync(product.id).catch(() => { throw new Error(t('action_failed')); });
    notify.success(t('deactivated', values));
  }

  async function confirmDelete() {
    await remove.mutateAsync(product.id).catch((err: unknown) => {
      throw new Error(t(err instanceof ApiError && err.status === 409 ? 'delete_refused' : 'action_failed'));
    });
    notify.success(t('deleted', values));
    router.replace('/products');
  }

  return {
    actions,
    entry: { variant: entry, close: () => setEntry(null) },
    format: { target: format, close: () => setFormat(null) },
    confirm: {
      ...confirm,
      setOpen: (open: boolean) => setConfirm((c) => ({ ...c, open })),
      run: confirm.kind === 'delete' ? confirmDelete : confirmDeactivate,
    },
  };
}

export type ProductDetailState = ReturnType<typeof useProductDetailState>;
