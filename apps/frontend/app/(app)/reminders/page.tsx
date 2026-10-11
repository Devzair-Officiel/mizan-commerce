'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import { qk } from '@/lib/query-keys';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useMarkReminderDone } from '@/lib/hooks/useReminders';
import { useFormatDate } from '@/lib/hooks/useFormat';

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

// Libellés sous `reminders.category` (ICU select sur la valeur).
const CATEGORY_OPTIONS = ['free', 'unpaid', 'customer_followup', 'zakat', 'order_prep'];

const DUE_OPTIONS: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };

function toLocalDatetime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RemindersPage() {
  const t = useTranslations('reminders');
  const formatDate = useFormatDate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [isNew,       setIsNew]       = useState(false);
  const [title,       setTitle]       = useState('');
  const [dueAt,       setDueAt]       = useState('');
  const [category,    setCategory]    = useState('free');
  const [description, setDescription] = useState('');
  const [filter,      setFilter]      = useState<'pending' | 'done'>('pending');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: qk.reminders.byFilter(filter),
    queryFn: () => apiFetch<{ results: Reminder[] }>(`/reminders/?status=${filter}`),
  });

  const { data: pendingData } = useQuery({
    queryKey: qk.reminders.pending,
    queryFn: () => apiFetch<{ results: Reminder[] }>('/reminders/?status=pending'),
  });

  const { data: doneData } = useQuery({
    queryKey: qk.reminders.done,
    queryFn: () => apiFetch<{ results: Reminder[] }>('/reminders/?status=done'),
  });

  function invalidateAll() { qc.invalidateQueries({ queryKey: qk.reminders.all }); }

  const markDone = useMarkReminderDone();
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
        <TopBar title={editing ? t('edit_title') : t('new_title')} />
        <div className="flex flex-col gap-3 p-4 pb-8">

          <FloatingInput
            id="title"
            label={t('field_title')}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <FloatingInput
            id="due-at"
            label={t('field_date')}
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />

          <FloatingSelect
            id="category"
            label={t('field_category')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORY_OPTIONS.map((value) => <option key={value} value={value}>{t('category', { value })}</option>)}
          </FloatingSelect>

          <FloatingInput
            id="description"
            label={t('field_description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="flex flex-col gap-2 mt-1">
            {editing && editing.status === 'pending' && (
              <Button variant="outline" className="w-full text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-950/20"
                onClick={() => markDone.mutate(editing.id, { onSuccess: resetForm })} disabled={markDone.isPending}>
                {markDone.isPending ? '…' : t('mark_done')}
              </Button>
            )}
            {editing && editing.status !== 'pending' && (
              <Button variant="outline" className="w-full text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                onClick={() => reopen.mutate(editing.id)} disabled={reopen.isPending}>
                {reopen.isPending ? '…' : t('reopen')}
              </Button>
            )}
            <Button disabled={!title || !dueAt || isPending} onClick={handleSave} className="w-full">
              {isPending ? t('saving') : editing ? t('update') : t('create')}
            </Button>
            {editing && (
              <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                disabled={remove.isPending}
                onClick={() => setConfirmRemove(true)}>
                {remove.isPending ? t('deleting') : t('delete')}
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={resetForm}>{t('cancel')}</Button>
          </div>
        </div>

        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title={t('confirm_delete')}
          onConfirm={() => { if (editing) return remove.mutateAsync(editing.id); }}
          variant="destructive"
          confirmLabel={t('confirm_delete_cta')}
        />
      </>
    );
  }

  return (
    <>
      <TopBar title={t('title')} action={<Button size="sm" onClick={openNew}>{t('new_cta')}</Button>} />
      <div className="flex flex-col gap-4 p-4">

        <div className="flex rounded-xl border border-border overflow-hidden text-sm font-medium">
          <button onClick={() => setFilter('pending')}
            className={`flex-1 py-2.5 transition-colors ${filter === 'pending' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}>
            {t('tab_pending', { count: pendingCount })}
          </button>
          <button onClick={() => setFilter('done')}
            className={`flex-1 py-2.5 border-s border-border transition-colors ${filter === 'done' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}>
            {t('tab_done', { count: doneCount })}
          </button>
        </div>

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

        {!isLoading && displayed.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {filter === 'pending' ? t('empty_pending') : t('empty_done')}
          </p>
        )}

        {displayed.length > 0 && (
          <div className="flex flex-col gap-2">
            {displayed.map((r) => (
              <button key={r.id} onClick={() => openReminder(r)}
                className={`w-full text-start flex items-start justify-between gap-3 px-4 py-3.5 rounded-2xl border border-border bg-card hover:bg-muted active:bg-muted transition-colors ${filter === 'done' ? 'opacity-60' : ''}`}>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <p className={`text-sm font-medium text-foreground truncate ${filter === 'done' ? 'line-through' : ''}`}>{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('category', { value: r.category })} · {formatDate(r.due_at, DUE_OPTIONS)}
                  </p>
                  {r.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.description}</p>}
                </div>
                <span className="text-muted-foreground text-lg shrink-0 rtl:rotate-180">›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
