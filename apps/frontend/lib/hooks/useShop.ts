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
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopUpdateData {
  name?: string;
  currency?: string;
  country?: string;
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

export function useUploadShopLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blob: Blob) => {
      const formData = new FormData();
      formData.append('logo', blob, 'logo.jpg');
      const res = await fetch('/api/proxy/shop/logo/', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? 'Erreur upload');
      }
      return res.json() as Promise<Shop>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shop'] }),
  });
}

export function useDeleteShopLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<Shop>('/shop/logo/', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shop'] }),
  });
}
