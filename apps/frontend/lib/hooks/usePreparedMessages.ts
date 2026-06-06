import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type PreparedMessageTemplate =
  | 'order_confirmation'
  | 'tracking'
  | 'unpaid_followup'
  | 'promo'
  | 'free';

export type PreparedMessageContext = 'order' | 'customer' | 'product' | 'none';

export type PreparedMessageStatus = 'prepared' | 'sent_manually' | 'archived';

export interface PreparedMessage {
  id: string;
  template_type: PreparedMessageTemplate;
  template_type_display: string;
  context_type: PreparedMessageContext;
  context_type_display: string;
  context_id: string | null;
  customer: string | null;
  recipient_name: string;
  recipient_phone: string;
  message: string;
  status: PreparedMessageStatus;
  status_display: string;
  sent_manually_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PreparedMessageCreateInput {
  template_type: PreparedMessageTemplate;
  context_type?: PreparedMessageContext;
  context_id?: string | null;
  customer_id?: string | null;
  custom_message?: string;
}

export interface PreparedMessagesFilters {
  customerId?: string | null;
  orderId?: string | null;
}

export function usePreparedMessages({ customerId, orderId }: PreparedMessagesFilters = {}) {
  const params = new URLSearchParams();
  if (customerId) params.set('customer', customerId);
  if (orderId) params.set('order', orderId);
  const qs = params.toString();
  const key = orderId
    ? qk.preparedMessages.byOrder(orderId)
    : customerId
      ? qk.preparedMessages.byCustomer(customerId)
      : qk.preparedMessages.all;
  return useQuery({
    queryKey: key,
    queryFn: () =>
      apiFetch<PaginatedResponse<PreparedMessage>>(
        `/messages/prepared/${qs ? `?${qs}` : ''}`,
      ),
    enabled: !!(customerId || orderId),
  });
}

export function useCreatePreparedMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PreparedMessageCreateInput) =>
      apiFetch<PreparedMessage>('/messages/prepared/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.preparedMessages.all }),
  });
}

export function useUpdatePreparedMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      apiFetch<PreparedMessage>(`/messages/prepared/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.preparedMessages.all }),
  });
}

export function useMarkMessageSent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<PreparedMessage>(`/messages/prepared/${id}/mark-sent/`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.preparedMessages.all }),
  });
}

export function useDeletePreparedMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<void>(`/messages/prepared/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.preparedMessages.all }),
  });
}
