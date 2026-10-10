'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/SectionCard';
import { FloatingTextarea } from '@/components/ui/floating-fields';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useCreateOrderNote, useDeleteNote, useOrderNotes, type Note } from '@/lib/hooks/useNotes';
import { useDayTime } from './useDayTime';

function NoteRow({ note, onDelete }: { note: Note; onDelete: () => void }) {
  const t = useTranslations('orders.notes');
  const { parts } = useDayTime();
  return (
    <li className="flex items-start gap-2 py-3 ps-4 pe-1 lg:ps-5">
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="whitespace-pre-wrap text-sm leading-normal wrap-break-word">{note.content}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('meta', { author: note.author_name ?? t('anonymous'), ...parts(note.created_at) })}
        </p>
      </div>
      <button type="button" onClick={onDelete} aria-label={t('delete_aria')}
        className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-destructive">
        <Trash2 size={15} aria-hidden />
      </button>
    </li>
  );
}

/** Carte « Notes » : notes internes de la commande, ajout et suppression (avec confirmation). */
export function OrderNotesCard({ orderId }: { orderId: string }) {
  const t = useTranslations('orders.notes');
  const { data } = useOrderNotes(orderId);
  const createNote = useCreateOrderNote(orderId);
  const deleteNote = useDeleteNote(orderId);
  const [formOpen, setFormOpen] = useState(false);
  const [input, setInput] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const notes = data?.results ?? [];

  async function handleAdd() {
    const trimmed = input.trim();
    if (!trimmed) return;
    await createNote.mutateAsync(trimmed);
    setInput('');
    setFormOpen(false);
  }

  const addButton = !formOpen && (
    <button type="button" onClick={() => setFormOpen(true)} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
      <Plus size={14} aria-hidden />{t('add_cta')}
    </button>
  );

  return (
    <SectionCard title={t('title')} rightSlot={addButton || undefined}>
      {formOpen && (
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3 lg:px-5">
          <FloatingTextarea id="note-content" label={t('field_label')} value={input} onChange={(e) => setInput(e.target.value)} rows={3} />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleAdd} disabled={createNote.isPending || !input.trim()}>
              {createNote.isPending ? t('saving') : t('save')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setFormOpen(false); setInput(''); }}>{t('cancel')}</Button>
          </div>
        </div>
      )}
      {notes.length > 0 ? (
        <ul className="divide-y divide-border">
          {notes.map((note) => <NoteRow key={note.id} note={note} onDelete={() => setPendingDeleteId(note.id)} />)}
        </ul>
      ) : !formOpen && (
        <p className="px-4 py-4 text-sm text-muted-foreground lg:px-5">{t('empty')}</p>
      )}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title={t('delete_confirm')}
        onConfirm={async () => { if (pendingDeleteId) await deleteNote.mutateAsync(pendingDeleteId); }}
        variant="destructive"
        confirmLabel={t('delete_cta')}
        cancelLabel={t('cancel')}
      />
    </SectionCard>
  );
}
