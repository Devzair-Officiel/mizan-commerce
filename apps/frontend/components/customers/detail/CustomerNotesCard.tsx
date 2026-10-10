'use client';

import { useTranslations } from 'next-intl';
import { NotesCard } from '@/components/notes/NotesCard';
import type { Customer } from '@/lib/hooks/useCustomers';
import { useCreateCustomerNote, useCustomerNotes, useDeleteCustomerNote } from '@/lib/hooks/useNotes';
import type { CustomerDetailState } from './useCustomerDetailState';

/** Carte « Notes » du client : la note de la fiche (formulaire client) puis les notes datées. */
export function CustomerNotesCard({ customer, notes }: { customer: Customer; notes: CustomerDetailState['notes'] }) {
  const t = useTranslations('customers.detail');
  const { data } = useCustomerNotes(customer.id);
  const createNote = useCreateCustomerNote(customer.id);
  const deleteNote = useDeleteCustomerNote(customer.id);
  const recordNote = customer.notes.trim() && (
    <div className="border-b border-border px-4 py-3 last:border-b-0 lg:px-5">
      <p className="whitespace-pre-wrap text-sm leading-normal wrap-break-word">{customer.notes}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('record_note')}</p>
    </div>
  );
  return (
    <div id="customer-notes" className="scroll-mt-20">
      <NotesCard
        notes={data?.results ?? []}
        emptyLabel={t('notes_empty')}
        creating={createNote.isPending}
        onCreate={createNote.mutateAsync}
        onDelete={deleteNote.mutateAsync}
        formOpen={notes.formOpen}
        onFormOpenChange={notes.setFormOpen}
        leading={recordNote || undefined}
      />
    </div>
  );
}
