import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk, type ReminderScope } from '@/lib/query-keys';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Reminder {
  id: string;
  title: string;
  description: string;
  due_at: string;
  category: string;
  customer: string | null;
  order: string | null;
  status: string;
}

export interface ReminderPayload {
  title: string;
  due_at: string;
  category?: string;
  description?: string;
  customer?: string;
  order?: string;
}

// Les rappels comptent dans l'accueil et le badge du menu : tout changement les rafraîchit.
function invalidateReminders(qc: QueryClient) {
  for (const queryKey of [qk.reminders.all, qk.dashboard.all, qk.navBadges.all]) {
    void qc.invalidateQueries({ queryKey });
  }
}

/** Un onglet de la page Rappels : « à faire » (en retard + aujourd'hui), « à venir », « terminés ». */
export function useReminders(scope: ReminderScope) {
  return useQuery({
    queryKey: qk.reminders.list(scope),
    queryFn: () => apiFetch<PaginatedResponse<Reminder>>(`/reminders/?scope=${scope}&page_size=100`),
  });
}

/** Rappel de relance en attente d'un client, lu au moment du clic (jamais en cache). */
export function useFindFollowupReminder() {
  const qc = useQueryClient();
  return async (customerId: string): Promise<Reminder | null> => {
    const data = await qc.fetchQuery({
      queryKey: qk.reminders.followup(customerId),
      queryFn: () => apiFetch<PaginatedResponse<Reminder>>(`/reminders/?customer=${customerId}&category=customer_followup`),
      staleTime: 0,
    });
    return data.results[0] ?? null;
  };
}

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReminderPayload) =>
      apiFetch<Reminder>('/reminders/', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => invalidateReminders(qc),
  });
}

export function useUpdateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ReminderPayload> }) =>
      apiFetch<Reminder>(`/reminders/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => invalidateReminders(qc),
  });
}

export function useMarkReminderDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Reminder>(`/reminders/${id}/done/`, { method: 'POST' }),
    onSuccess: () => invalidateReminders(qc),
  });
}

export function useReopenReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Reminder>(`/reminders/${id}/reopen/`, { method: 'POST' }),
    onSuccess: () => invalidateReminders(qc),
  });
}

export function useDeleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/reminders/${id}/`, { method: 'DELETE' }),
    onSuccess: () => invalidateReminders(qc),
  });
}
