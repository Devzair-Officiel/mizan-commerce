'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';

interface Reminder {
  id: string;
  title: string;
  description: string;
  due_at: string;
  category: string;
  category_display: string;
  status: string;
  status_display: string;
}

interface ReminderPayload {
  title: string;
  due_at: string;
  category: string;
  description: string;
}

const CATEGORY_OPTIONS = [
  { value: 'free',             label: 'Libre' },
  { value: 'unpaid',           label: 'Impayé' },
  { value: 'customer_followup',label: 'Relance client' },
  { value: 'zakat',            label: 'Zakat' },
  { value: 'order_prep',       label: 'Préparation commande' },
];

function toLocalDatetime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RemindersPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [isNew,       setIsNew]       = useState(false);
  const [title,       setTitle]       = useState('');
  const [dueAt,       setDueAt]       = useState('');
  const [category,    setCategory]    = useState('free');
  const [description, setDescription] = useState('');
  const [filter,      setFilter]      = useState<'pending' | 'done'>('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['reminders', filter],
    queryFn: () => apiFetch<{ results: Reminder[] }>(`/reminders/?status=${filter}`),
  });

  const { data: pendingData } = useQuery({
    queryKey: ['reminders', 'pending'],
    queryFn: () => apiFetch<{ results: Reminder[] }>('/reminders/?status=pending'),
  });

  const { data: doneData } = useQuery({
    queryKey: ['reminders', 'done'],
    queryFn: () => apiFetch<{ results: Reminder[] }>('/reminders/?status=done'),
  });

  function invalidateAll() { qc.invalidateQueries({ queryKey: ['reminders'] }); }

  const markDone = useMutation({
    mutationFn: (id: string) => apiFetch<Reminder>(`/reminders/${id}/done/`, { method: 'POST' }),
    onSuccess: () => { invalidateAll(); resetForm(); },
  });
  const reopen = useMutation({
    mutationFn: (id: string) => apiFetch<Reminder>(`/reminders/${id}/reopen/`, { method: 'POST' }),
    onSuccess: () => { invalidateAll(); resetForm(); },
  });
  const create = useMutation({
    mutationFn: (payload: ReminderPayload) =>
      apiFetch<Reminder>('/reminders/', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidateAll(); resetForm(); },
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReminderPayload }) =>
      apiFetch<Reminder>(`/reminders/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidateAll(); resetForm(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/reminders/${id}/`, { method: 'DELETE' }),
    onSuccess: () => { invalidateAll(); resetForm(); },
  });

  function resetForm() {
    setEditing(null); setIsNew(false);
    setTitle(''); setDueAt(''); setCategory('free'); setDescription('');
  }

  function openReminder(r: Reminder) {
    setEditing(r);
    setTitle(r.title);
    setDueAt(toLocalDatetime(r.due_at));
    setCategory(r.category);
    setDescription(r.description ?? '');
    setIsNew(false);
  }

  function openNew() {
    setEditing(null);
    setTitle(''); setDueAt(''); setCategory('free'); setDescription('');
    setIsNew(true);
  }

  function handleSave() {
    const payload = { title, due_at: new Date(dueAt).toISOString(), category, description };
    if (editing) update.mutate({ id: editing.id, payload });
    else         create.mutate(payload);
  }

  const isPending    = create.isPending || update.isPending;
  const showForm     = isNew || editing !== null;
  const pendingCount = pendingData?.results.length ?? 0;
  const doneCount    = doneData?.results.length ?? 0;
  const displayed    = data?.results ?? [];

  if (showForm) {
    return (
      <>
        <TopBar title={editing ? 'Modifier le rappel' : 'Nouveau rappel'} />
        <div className="flex flex-col gap-3 p-4 pb-8">

          <FloatingInput
            id="title"
            label="Titre *"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <FloatingInput
            id="due-at"
            label="Date *"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />

          <FloatingSelect
            id="category"
            label="Catégorie"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FloatingSelect>

          <FloatingInput
            id="description"
            label="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="flex flex-col gap-2 mt-1">
            {editing && editing.status === 'pending' && (
              <Button variant="outline" className="w-full text-green-600 border-green-200 hover:bg-green-50"
                onClick={() => markDone.mutate(editing.id)} disabled={markDone.isPending}>
                {markDone.isPending ? '…' : 'Marquer comme terminé'}
              </Button>
            )}
            {editing && editing.status !== 'pending' && (
              <Button variant="outline" className="w-full text-amber-600 border-amber-200 hover:bg-amber-50"
                onClick={() => reopen.mutate(editing.id)} disabled={reopen.isPending}>
                {reopen.isPending ? '…' : 'Remettre en attente'}
              </Button>
            )}
            <Button disabled={!title || !dueAt || isPending} onClick={handleSave} className="w-full">
              {isPending ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Créer le rappel'}
            </Button>
            {editing && (
              <Button variant="outline" className="w-full text-red-500 border-red-200 hover:bg-red-50"
                disabled={remove.isPending}
                onClick={() => { if (confirm('Supprimer ce rappel ?')) remove.mutate(editing.id); }}>
                {remove.isPending ? 'Suppression…' : 'Supprimer le rappel'}
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
      <TopBar title="Rappels" action={<Button size="sm" onClick={openNew}>+ Nouveau</Button>} />
      <div className="flex flex-col gap-4 p-4">

        <div className="flex rounded-xl border border-border overflow-hidden text-sm font-medium">
          <button onClick={() => setFilter('pending')}
            className={`flex-1 py-2.5 transition-colors ${filter === 'pending' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}>
            En attente{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
          <button onClick={() => setFilter('done')}
            className={`flex-1 py-2.5 border-l border-border transition-colors ${filter === 'done' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}>
            Terminés{doneCount > 0 ? ` (${doneCount})` : ''}
          </button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>}

        {!isLoading && displayed.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {filter === 'pending' ? 'Aucun rappel en attente.' : 'Aucun rappel terminé.'}
          </p>
        )}

        {displayed.length > 0 && (
          <div className="flex flex-col gap-2">
            {displayed.map((r) => (
              <button key={r.id} onClick={() => openReminder(r)}
                className={`w-full text-left flex items-start justify-between gap-3 px-4 py-3.5 rounded-2xl border border-border bg-card hover:bg-muted active:bg-muted transition-colors ${filter === 'done' ? 'opacity-60' : ''}`}>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <p className={`text-sm font-medium text-foreground truncate ${filter === 'done' ? 'line-through' : ''}`}>{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.category_display} · {new Date(r.due_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {r.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.description}</p>}
                </div>
                <span className="text-muted-foreground text-lg shrink-0">›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
