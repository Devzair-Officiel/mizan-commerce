import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface Shop {
  id: string;
  name: string;
  currency: string;
  country: string;
  timezone: string;
  zakat_annual_date: string | null;
  logo_object_key: string;
  created_at: string;
  updated_at: string;
}

export interface ShopUpdateData {
  name?: string;
  currency?: string;
  country?: string;
  timezone?: string;
  zakat_annual_date?: string | null;
}

export function useShop() {
  return useQuery({
    queryKey: ['shop'],
    queryFn: () => apiFetch<Shop>('/shop/'),
  });
}

export function useUpdateShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ShopUpdateData) =>
      apiFetch<Shop>('/shop/', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shop'] }),
  });
}
