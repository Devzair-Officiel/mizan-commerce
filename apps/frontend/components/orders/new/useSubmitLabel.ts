import { useTranslations } from 'next-intl';

/** Libellé du bouton final : « Enregistrer la commande » ou « Enregistrer les modifications ». */
export function useSubmitLabel(mode: 'create' | 'edit', isPending: boolean): string {
  const tNew = useTranslations('orders.new');
  const tEdit = useTranslations('orders.edit');
  if (mode === 'edit') return isPending ? tEdit('saving') : tEdit('submit_label');
  return isPending ? tNew('submit_creating') : tNew('submit_label');
}
