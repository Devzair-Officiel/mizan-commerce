'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/SectionCard';
import { FloatingTextarea } from '@/components/ui/floating-fields';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useDayTime } from '@/components/orders/detail/useDayTime';
import type { Note } from '@/lib/hooks/useNotes';

function NoteRow({ note, onDelete }: { note: Note; onDelete: () => void }) {
  const t = useTranslations('ui.notes');
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

interface NotesCardProps {
  notes: Note[];
  emptyLabel: string;
  creating: boolean;
  onCreate: (content: string) => Promise<unknown>;
  onDelete: (noteId: string) => Promise<unknown>;
  /** Formulaire piloté par le parent (ouvert depuis un menu), sinon géré ici. */
  formOpen?: boolean;
  onFormOpenChange?: (open: boolean) => void;
  /** Contenu affiché avant les notes (note de la fiche client). */
  leading?: ReactNode;
}

/** Carte « Notes » : notes internes (commande ou client), ajout et suppression avec confirmation. */
export function NotesCard({ notes, emptyLabel, creating, onCreate, onDelete, leading, ...form }: NotesCardProps) {
  const t = useTranslations('ui.notes');
  const [ownOpen, setOwnOpen] = useState(false);
  const formOpen = form.formOpen ?? ownOpen;
  const setFormOpen = form.onFormOpenChange ?? setOwnOpen;
  const [input, setInput] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = input.trim();
    if (!trimmed) return;
    await onCreate(trimmed);
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
          <FloatingTextarea id="note-content" label={t('field_label')} value={input} onChange={(e) => setInput(e.target.value)} rows={3} autoFocus />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleAdd} disabled={creating || !input.trim()}>
              {creating ? t('saving') : t('save')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setFormOpen(false); setInput(''); }}>{t('cancel')}</Button>
          </div>
        </div>
      )}
      {leading}
      {notes.length > 0 ? (
        <ul className="divide-y divide-border">
          {notes.map((note) => <NoteRow key={note.id} note={note} onDelete={() => setPendingDeleteId(note.id)} />)}
        </ul>
      ) : !formOpen && !leading && (
        <p className="px-4 py-4 text-sm text-muted-foreground lg:px-5">{emptyLabel}</p>
      )}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title={t('delete_confirm')}
        onConfirm={async () => { if (pendingDeleteId) await onDelete(pendingDeleteId); }}
        variant="destructive"
        confirmLabel={t('delete_cta')}
        cancelLabel={t('cancel')}
      />
    </SectionCard>
  );
}
