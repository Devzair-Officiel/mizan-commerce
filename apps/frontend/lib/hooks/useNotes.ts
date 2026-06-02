import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

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

export function useOrderNotes(orderId: string) {
  return useQuery({
    queryKey: ['notes', 'order', orderId],
    queryFn: () => apiFetch<PaginatedResponse<Note>>(`/notes/?order=${orderId}`),
    enabled: !!orderId,
  });
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
      qc.invalidateQueries({ queryKey: ['notes', 'order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders', orderId, 'activity'] });
    },
  });
}

export function useDeleteNote(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      apiFetch<void>(`/notes/${noteId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', 'order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders', orderId, 'activity'] });
    },
  });
}
