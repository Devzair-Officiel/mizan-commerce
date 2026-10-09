'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, StickyNote, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FloatingTextarea } from '@/components/ui/floating-fields';
import { useCreateOrderNote, useDeleteNote, useOrderNotes } from '@/lib/hooks/useNotes';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useFormatDateTime, useRelativeTime } from '@/lib/hooks/useFormat';

interface OrderNotesCardProps {
  orderId: string;
}

export function OrderNotesCard({ orderId }: OrderNotesCardProps) {
  const t = useTranslations('orders.notes');
  const formatDateTime = useFormatDateTime();
  const relativeTime = useRelativeTime();

  const { data: notesData } = useOrderNotes(orderId);
  const createNote = useCreateOrderNote(orderId);
  const deleteNote = useDeleteNote(orderId);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function handleAddNote() {
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    await createNote.mutateAsync(trimmed);
    setNoteInput('');
    setShowNoteForm(false);
  }

  async function handleDeleteNote(noteId: string) {
    await deleteNote.mutateAsync(noteId);
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <StickyNote size={14} />
          {t('title')}
          {notesData && notesData.count > 0 && (
            <span className="text-muted-foreground normal-case font-normal tracking-normal">
              ({notesData.count})
            </span>
          )}
        </h2>
        {!showNoteForm && (
          <button
            type="button"
            onClick={() => setShowNoteForm(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus size={13} />
            {t('add_cta')}
          </button>
        )}
      </div>

      {showNoteForm && (
        <div className="p-3 border-b border-border flex flex-col gap-2">
          <FloatingTextarea
            id="note-content"
            label={t('field_label')}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={handleAddNote}
              disabled={createNote.isPending || !noteInput.trim()}
            >
              {createNote.isPending ? t('saving') : t('save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowNoteForm(false); setNoteInput(''); }}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {notesData?.results.length ? (
        <ul className="divide-y divide-border">
          {notesData.results.map((note) => {
            const fullTimestamp = formatDateTime(note.created_at, {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            return (
              <li key={note.id} className="px-4 py-3 flex flex-col gap-1.5">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {note.content}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {note.author_name ?? t('anonymous')} ·{' '}
                    <span title={fullTimestamp}>{relativeTime(note.created_at)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(note.id)}
                    aria-label={t('delete_aria')}
                    className="inline-flex items-center justify-center h-11 w-11 -mr-2.5 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : !showNoteForm && (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {t('empty')}
        </p>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title={t('delete_confirm')}
        onConfirm={() => { if (pendingDeleteId) handleDeleteNote(pendingDeleteId); }}
        variant="destructive"
        confirmLabel="Supprimer"
      />
    </div>
  );
}
