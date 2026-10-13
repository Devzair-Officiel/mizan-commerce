'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ReminderList } from '@/components/reminders/ReminderList';
import { ReminderTabs } from '@/components/reminders/ReminderTabs';
import {
  useCreateReminder, useDeleteReminder, useMarkReminderDone, useReopenReminder, useUpdateReminder, type Reminder,
} from '@/lib/hooks/useReminders';
import type { ReminderScope } from '@/lib/query-keys';

// Libellés sous `reminders.category` (ICU select sur la valeur).
const CATEGORY_OPTIONS = ['free', 'unpaid', 'customer_followup', 'zakat', 'order_prep'];

function toLocalDatetime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RemindersPage() {
  const t = useTranslations('reminders');
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [isNew,       setIsNew]       = useState(false);
  const [title,       setTitle]       = useState('');
  const [dueAt,       setDueAt]       = useState('');
  const [category,    setCategory]    = useState('free');
  const [description, setDescription] = useState('');
  const [scope,       setScope]       = useState<ReminderScope>('todo');
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Chaque mutation rafraîchit la liste, l'accueil et le badge du menu (useReminders).
  const markDone = useMarkReminderDone();
  const reopen = useReopenReminder();
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const remove = useDeleteReminder();

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
    if (editing) update.mutate({ id: editing.id, payload }, { onSuccess: resetForm });
    else         create.mutate(payload, { onSuccess: resetForm });
  }

  const isPending    = create.isPending || update.isPending;
  const showForm     = isNew || editing !== null;

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
                onClick={() => reopen.mutate(editing.id, { onSuccess: resetForm })} disabled={reopen.isPending}>
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
          onConfirm={async () => { if (editing) { await remove.mutateAsync(editing.id); resetForm(); } }}
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

        <ReminderTabs value={scope} onChange={setScope} />
        <ReminderList scope={scope} onOpen={openReminder} />
      </div>
    </>
  );
}
