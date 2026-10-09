'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StickyNote } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { qk } from '@/lib/query-keys';
import { ConfirmDialog } from '@/components/ui/dialog';

interface Note {
  id: string;
  content: string;
  author_name: string;
  customer: string | null;
  order: string | null;
  created_at: string;
}

interface NotePayload {
  content: string;
  customer?: string | null;
  order?: string | null;
}

export default function NotesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Note | null>(null);
  const [content, setContent] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: qk.notes.all,
    queryFn: () => apiFetch<{ results: Note[] }>('/notes/'),
  });

  const create = useMutation({
    mutationFn: (payload: NotePayload) =>
      apiFetch<Note>('/notes/', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.notes.all }); resetForm(); },
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: NotePayload }) =>
      apiFetch<Note>(`/notes/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.notes.all }); resetForm(); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/notes/${id}/`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.notes.all }); resetForm(); },
  });

  function resetForm() {
    setEditing(null);
    setIsNew(false);
    setContent('');
  }

  function openNote(note: Note) {
    setEditing(note);
    setContent(note.content);
    setIsNew(false);
  }

  function openNew() {
    setEditing(null);
    setContent('');
    setIsNew(true);
  }

  function handleSave() {
    if (editing) {
      update.mutate({ id: editing.id, payload: { content } });
    } else {
      create.mutate({ content });
    }
  }

  const isPending = create.isPending || update.isPending;
  const showForm = isNew || editing !== null;

  if (showForm) {
    return (
      <>
        <TopBar title={editing ? 'Modifier la note' : 'Nouvelle note'} />
        <div className="flex flex-col gap-4 p-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            autoFocus
            placeholder="Écrivez votre note…"
            className="rounded-xl border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground resize-none"
          />
          <div className="flex flex-col gap-2">
            <Button disabled={!content.trim() || isPending} onClick={handleSave} className="w-full">
              {isPending ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Enregistrer'}
            </Button>
            {editing && (
              <Button
                variant="outline"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                disabled={remove.isPending}
                onClick={() => setConfirmRemove(true)}
              >
                {remove.isPending ? 'Suppression…' : 'Supprimer la note'}
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={resetForm}>Annuler</Button>
          </div>
        </div>

        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title="Supprimer cette note ?"
          onConfirm={() => { if (editing) return remove.mutateAsync(editing.id); }}
          variant="destructive"
          confirmLabel="Supprimer"
        />
      </>
    );
  }

  return (
    <>
      <TopBar
        back
        title="Notes"
        action={<Button size="sm" onClick={openNew}>+ Nouvelle</Button>}
      />
      <div className="flex flex-col gap-3 p-4">
        {isLoading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <div className="h-4 bg-muted animate-pulse rounded-md mb-2" />
                <div className="h-3 bg-muted animate-pulse rounded-md w-1/3" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && (data?.results ?? []).length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted">
              <StickyNote className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Aucune note</p>
              <p className="text-xs text-muted-foreground mt-1">Appuyez sur + Nouvelle pour créer votre première note.</p>
            </div>
          </div>
        )}

        {(data?.results ?? []).map((note) => (
          <button
            key={note.id}
            onClick={() => openNote(note)}
            className="w-full text-left rounded-xl border border-border bg-card p-4 hover:bg-muted active:bg-muted"
          >
            <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap">{note.content}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {new Date(note.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              {note.author_name ? ` · ${note.author_name}` : ''}
            </p>
          </button>
        ))}
      </div>
    </>
  );
}
