import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useShowMoreQuery } from '@/lib/hooks/useShowMoreQuery';

export type PreparedMessageTemplate =
  | 'order_confirmation'
  | 'tracking'
  | 'unpaid_followup'
  | 'thank_you'
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
  /** WhatsApp s'ouvre avec ce texte : enregistré directement comme envoyé. */
  sent?: boolean;
}

export interface PreparedMessagesFilters {
  customerId?: string | null;
  orderId?: string | null;
}

/** Historique des messages d'une commande ou d'un client : 5, puis « Voir plus ». */
export function usePreparedMessages({ customerId, orderId }: PreparedMessagesFilters) {
  const key = orderId ? qk.preparedMessages.byOrder(orderId) : qk.preparedMessages.byCustomer(customerId ?? '');
  return useShowMoreQuery<PreparedMessage>(
    key, '/messages/prepared/', { customer: customerId ?? undefined, order: orderId ?? undefined }, !!(customerId || orderId),
  );
}

// `onError` au niveau du hook : il s'exécute même si la fenêtre d'envoi est déjà fermée.
export function useCreatePreparedMessage({ onError }: { onError?: () => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PreparedMessageCreateInput) =>
      apiFetch<PreparedMessage>('/messages/prepared/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.preparedMessages.all }),
    onError,
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

export function useDeletePreparedMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<void>(`/messages/prepared/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.preparedMessages.all }),
  });
}
