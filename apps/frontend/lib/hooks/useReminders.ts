import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface CreateReminderPayload {
  title: string;
  due_at: string;
  category?: string;
  description?: string;
  customer?: string;
  order?: string;
}

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateReminderPayload) =>
      apiFetch<{ id: string }>('/reminders/', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
