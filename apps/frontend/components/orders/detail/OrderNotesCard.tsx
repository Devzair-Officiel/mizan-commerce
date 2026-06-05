import { useState } from 'react';
import { Plus, StickyNote, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FloatingTextarea } from '@/components/ui/floating-fields';
import { useCreateOrderNote, useDeleteNote, useOrderNotes } from '@/lib/hooks/useNotes';
import { FULL_FMT, relativeTime } from './constants';

interface OrderNotesCardProps {
  orderId: string;
}

export function OrderNotesCard({ orderId }: OrderNotesCardProps) {
  const { data: notesData } = useOrderNotes(orderId);
  const createNote = useCreateOrderNote(orderId);
  const deleteNote = useDeleteNote(orderId);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteInput, setNoteInput] = useState('');

  async function handleAddNote() {
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    await createNote.mutateAsync(trimmed);
    setNoteInput('');
    setShowNoteForm(false);
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm('Supprimer cette note ?')) return;
    await deleteNote.mutateAsync(noteId);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <StickyNote size={14} />
          Notes
          {notesData && notesData.count > 0 && (
            <span className="text-zinc-400 normal-case font-normal tracking-normal">
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
            Ajouter
          </button>
        )}
      </div>

      {showNoteForm && (
        <div className="p-3 border-b border-zinc-100 flex flex-col gap-2">
          <FloatingTextarea
            id="note-content"
            label="Nouvelle note"
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
              {createNote.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowNoteForm(false); setNoteInput(''); }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {notesData?.results.length ? (
        <ul className="divide-y divide-zinc-100">
          {notesData.results.map((note) => (
            <li key={note.id} className="px-4 py-3 flex flex-col gap-1.5">
              <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
                {note.content}
              </p>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>
                  {note.author_name ?? 'Anonyme'} · <span title={FULL_FMT.format(new Date(note.created_at))}>{relativeTime(note.created_at)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteNote(note.id)}
                  aria-label="Supprimer la note"
                  className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : !showNoteForm && (
        <p className="px-4 py-6 text-center text-sm text-zinc-400">
          Aucune note pour cette commande.
        </p>
      )}
    </div>
  );
}
