import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useShowMoreQuery } from '@/lib/hooks/useShowMoreQuery';

export interface Note {
  id: string;
  customer: string | null;
  order: string | null;
  content: string;
  author: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Notes de la commande : 5, puis « Voir plus ». */
export function useOrderNotes(orderId: string) {
  return useShowMoreQuery<Note>(qk.notes.byOrder(orderId), '/notes/', { order: orderId }, !!orderId);
}

export function useCreateOrderNote(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<Note>('/notes/', {
        method: 'POST',
        body: JSON.stringify({ order: orderId, content }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notes.byOrder(orderId) });
      qc.invalidateQueries({ queryKey: qk.orders.activity(orderId) });
    },
  });
}

export function useDeleteNote(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      apiFetch<void>(`/notes/${noteId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notes.byOrder(orderId) });
      qc.invalidateQueries({ queryKey: qk.orders.activity(orderId) });
    },
  });
}

/** Notes du client : 5, puis « Voir plus ». */
export function useCustomerNotes(customerId: string) {
  return useShowMoreQuery<Note>(qk.notes.byCustomer(customerId), '/notes/', { customer: customerId }, !!customerId);
}

/** Rafraîchit les notes du client et son activité (les notes y figurent). */
function useInvalidateCustomerNotes(customerId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.notes.byCustomer(customerId) });
    qc.invalidateQueries({ queryKey: [...qk.customers.detail(customerId), 'activity'] });
  };
}

export function useCreateCustomerNote(customerId: string) {
  const invalidate = useInvalidateCustomerNotes(customerId);
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<Note>('/notes/', {
        method: 'POST',
        body: JSON.stringify({ customer: customerId, content }),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteCustomerNote(customerId: string) {
  const invalidate = useInvalidateCustomerNotes(customerId);
  return useMutation({
    mutationFn: (noteId: string) =>
      apiFetch<void>(`/notes/${noteId}/`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
