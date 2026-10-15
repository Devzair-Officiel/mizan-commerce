import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { InvoiceSettingsValues } from '@/components/settings/invoices/schema';

export interface InvoiceSettings extends InvoiceSettingsValues {
  name: string;
  logo_url: string | null;
  invoice_auto_color: string;
  resolved_color: string;
}

export function useInvoiceSettings() {
  return useQuery({
    queryKey: qk.shop.invoiceSettings,
    queryFn: () => apiFetch<InvoiceSettings>('/shop/invoice-settings/'),
  });
}

export function useUpdateInvoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: InvoiceSettingsValues) => apiFetch<InvoiceSettings>('/shop/invoice-settings/', {
      method: 'PATCH', body: JSON.stringify(values),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shop.all }),
  });
}
