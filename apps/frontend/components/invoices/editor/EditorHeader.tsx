'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import { TopBar } from '@/components/layout/TopBar';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { useDeleteDraftInvoice } from '@/lib/hooks/useInvoiceDrafts';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { notify } from '@/lib/notify';
import type { SaveStatus } from './useDraftAutosave';

interface EditorHeaderProps {
  /** Brouillon enregistré ; absent tant que rien n'est enregistré (rien à supprimer). */
  id: string | undefined;
  status: SaveStatus;
  savedAt: string | null;
  flush: () => Promise<string | null>;
}

/** En-tête : « Nouvelle facture », état de l'enregistrement automatique, « ⋯ » avec la suppression du brouillon. */
export function EditorHeader({ id, status, savedAt, flush }: EditorHeaderProps) {
  const t = useTranslations('invoices.editor');
  const router = useRouter();
  const date = useFormatDate();
  const isDesktop = useIsDesktop();
  const back = useBackOr('/invoices');
  const [confirming, setConfirming] = useState(false);
  const { mutateAsync: remove, isPending } = useDeleteDraftInvoice();
  const value = status === 'pending' || status === 'saving' ? 'saving' : status === 'error' || status === 'conflict' ? status : savedAt ? 'saved' : 'new';
  const subtitle = t('save_status', { value, time: savedAt ? date(savedAt, { hour: '2-digit', minute: '2-digit' }) : '', auto: isDesktop ? 'yes' : 'no' });

  const confirmDelete = async () => {
    if (!id) return;
    try {
      // Aucun enregistrement en attente ne doit viser le brouillon supprimé.
      await flush();
      await remove(id);
      setConfirming(false);
      notify.success(t('deleted'));
      router.replace('/invoices');
    } catch {
      notify.error(t('delete_error'));
    }
  };

  const danger = { key: 'delete', icon: Trash2, label: t('delete'), onSelect: () => setConfirming(true), destructive: true };
  const menu = id ? <DetailActionsMenu actions={{ items: [], danger }} variant={isDesktop ? 'menu' : 'sheet'} /> : undefined;
  return <>
    <TopBar title={t('title')} subtitle={subtitle} back backLabel={t('back')} onBack={back} hideSearch action={menu} />
    <ConfirmDialog open={confirming} onOpenChange={(open) => { if (!open && !isPending) setConfirming(false); }}
      title={t('delete_title')} description={t('delete_body')} confirmLabel={t('delete')} cancelLabel={t('keep')}
      variant="destructive" onConfirm={confirmDelete} />
  </>;
}
