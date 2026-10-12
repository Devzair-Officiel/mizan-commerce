'use client';

import { useTranslations } from 'next-intl';
import { NotesCard } from '@/components/notes/NotesCard';
import { useCreateOrderNote, useDeleteNote, useOrderNotes } from '@/lib/hooks/useNotes';

/** Carte « Notes » de la commande. */
export function OrderNotesCard({ orderId }: { orderId: string }) {
  const t = useTranslations('orders.detail');
  const list = useOrderNotes(orderId);
  const createNote = useCreateOrderNote(orderId);
  const deleteNote = useDeleteNote(orderId);
  return (
    <NotesCard
      list={list}
      emptyLabel={t('notes_empty')}
      creating={createNote.isPending}
      onCreate={createNote.mutateAsync}
      onDelete={deleteNote.mutateAsync}
    />
  );
}
