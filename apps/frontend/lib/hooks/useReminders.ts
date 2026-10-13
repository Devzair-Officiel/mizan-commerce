import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import { qk, type ReminderFilters, type ReminderScope } from '@/lib/query-keys';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Groupe de la liste, calculé par le serveur dans le fuseau de la boutique. */
export type ReminderMoment = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

export interface ReminderOrderInfo {
  id: string;
  order_number: string;
  created_at: string;
  total_amount: string;
  amount_paid: string;
  payment_status: string;
}

export interface Reminder {
  id: string;
  title: string;
  description: string;
  due_at: string;
  category: string;
  customer: string | null;
  customer_info: { id: string; display_name: string; phone: string } | null;
  order: string | null;
  order_info: ReminderOrderInfo | null;
  status: string;
  /** Vide : pour toute l'équipe. */
  assigned_to: string | null;
  assigned_to_name: string | null;
  is_automatic: boolean;
  moment: ReminderMoment;
  done_at: string | null;
}

export interface ReminderPayload {
  title: string;
  due_at: string;
  category?: string;
  description?: string;
  customer?: string | null;
  order?: string | null;
  assigned_to?: string | null;
}

/** Compteurs de la page, avec les filtres de la liste. */
export interface ReminderSummary {
  overdue: number;
  todo: number;
  upcoming: number;
  tomorrow: number;
  this_week: number;
  done: number;
}

export interface ReminderAssignee {
  id: string;
  full_name: string;
  role: string;
  /** Le membre connecté (« Moi »). */
  is_me: boolean;
}

export interface ReminderSettings {
  unpaid_followup_enabled: boolean;
  unpaid_followup_days: number;
  pending_orders_enabled: boolean;
  pending_orders_days: number;
  daily_summary_enabled: boolean;
  daily_summary_hour: number;
}

function filterParams(filters: ReminderFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}

// Les rappels comptent dans l'accueil et le badge du menu : tout changement les rafraîchit.
function invalidateReminders(qc: QueryClient) {
  for (const queryKey of [qk.reminders.all, qk.dashboard.all, qk.navBadges.all]) {
    void qc.invalidateQueries({ queryKey });
  }
}

// À faire et À venir tiennent sur une page ; les terminés se chargent par 20 (« Voir plus »).
const PAGE_SIZE: Record<ReminderScope, number> = { todo: 100, upcoming: 100, done: 20 };

/** Un onglet de la page Rappels : « à faire » (en retard + aujourd'hui), « à venir », « terminés » (les plus récents d'abord). */
export function useReminderList(scope: ReminderScope, filters: ReminderFilters) {
  const query = useInfiniteQuery({
    queryKey: qk.reminders.list(scope, filters),
    queryFn: ({ pageParam }) => {
      const params = filterParams(filters);
      params.set('scope', scope);
      params.set('page', String(pageParam));
      params.set('page_size', String(PAGE_SIZE[scope]));
      if (scope === 'done') params.set('ordering', '-done_at');
      return apiFetch<PaginatedResponse<Reminder>>(`/reminders/?${params}`);
    },
    initialPageParam: 1,
    getNextPageParam: (last, _, lastPage) => (last.next ? lastPage + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const pages = query.data?.pages;
  const items = useMemo(() => (pages ?? []).flatMap((page) => page.results), [pages]);
  return {
    items,
    count: pages?.[0]?.count ?? 0,
    isLoading: query.isLoading,
    hasMore: query.hasNextPage,
    isFetchingMore: query.isFetchingNextPage,
    loadMore: () => { void query.fetchNextPage(); },
  };
}

export function useReminderSummary(filters: ReminderFilters) {
  return useQuery({
    queryKey: qk.reminders.summary(filters),
    queryFn: () => apiFetch<ReminderSummary>(`/reminders/summary/?${filterParams(filters)}`),
    placeholderData: keepPreviousData,
  });
}

/** Membres à qui attribuer un rappel ; un seul membre = pas d'équipe. */
export function useReminderAssignees() {
  return useQuery({
    queryKey: qk.reminders.assignees,
    queryFn: () => apiFetch<ReminderAssignee[]>('/reminders/assignees/'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useReminderSettings() {
  return useQuery({
    queryKey: qk.reminders.settings,
    queryFn: () => apiFetch<ReminderSettings>('/reminders/settings/'),
  });
}

/** Réglages des rappels automatiques (propriétaire et administrateurs), appliqués tout de suite à l'écran. */
export function useUpdateReminderSettings() {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: 'reminder-settings' },
    mutationFn: (data: Partial<ReminderSettings>) =>
      apiFetch<ReminderSettings>('/reminders/settings/', { method: 'PATCH', body: JSON.stringify(data) }),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: qk.reminders.settings });
      const previous = qc.getQueryData<ReminderSettings>(qk.reminders.settings);
      qc.setQueryData<ReminderSettings>(qk.reminders.settings, (current) => (current ? { ...current, ...data } : current));
      return { previous };
    },
    onError: (_error, _data, context) => {
      if (context?.previous) qc.setQueryData(qk.reminders.settings, context.previous);
    },
    onSuccess: (data) => qc.setQueryData(qk.reminders.settings, data),
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
