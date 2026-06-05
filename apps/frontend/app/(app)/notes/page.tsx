'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { qk } from '@/lib/query-keys';

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
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
          />
          <div className="flex flex-col gap-2">
            <Button disabled={!content.trim() || isPending} onClick={handleSave} className="w-full">
              {isPending ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Enregistrer'}
            </Button>
            {editing && (
              <Button
                variant="outline"
                className="w-full text-red-500 border-red-200 hover:bg-red-50"
                disabled={remove.isPending}
                onClick={() => { if (confirm('Supprimer cette note ?')) remove.mutate(editing.id); }}
              >
                {remove.isPending ? 'Suppression…' : 'Supprimer la note'}
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={resetForm}>Annuler</Button>
          </div>
        </div>
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
        {isLoading && <p className="text-sm text-zinc-400 text-center py-8">Chargement…</p>}

        {!isLoading && (data?.results ?? []).length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-8">Aucune note.</p>
        )}

        {(data?.results ?? []).map((note) => (
          <button
            key={note.id}
            onClick={() => openNote(note)}
            className="w-full text-left rounded-xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50 active:bg-zinc-100"
          >
            <p className="text-sm text-zinc-900 line-clamp-3 whitespace-pre-wrap">{note.content}</p>
            <p className="text-xs text-zinc-400 mt-2">
              {new Date(note.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              {note.author_name ? ` · ${note.author_name}` : ''}
            </p>
          </button>
        ))}
      </div>
    </>
  );
}
