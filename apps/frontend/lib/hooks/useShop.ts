import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { CatalogKind, DashboardMode } from './useMe';

export type NisabMethod = 'gold' | 'silver';

export interface Shop {
  id: string;
  name: string;
  currency: string;
  country: string;
  timezone: string;
  zakat_annual_date: string | null;
  nisab_method: NisabMethod;
  nisab_unit_price: string | null;
  logo_object_key: string;
  logo_url: string | null;
  legal_address: string;
  tax_id: string;
  legal_mentions: string;
  default_tax_rate: string;
  default_payment_terms_days: number;
  catalog_kind: CatalogKind;
  dashboard_mode: DashboardMode;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopUpdateData {
  name?: string;
  currency?: string;
  country?: string;
  zakat_annual_date?: string | null;
  nisab_method?: NisabMethod;
  nisab_unit_price?: string | null;
  legal_address?: string;
  tax_id?: string;
  legal_mentions?: string;
  default_tax_rate?: string;
  default_payment_terms_days?: number;
  catalog_kind?: CatalogKind;
  dashboard_mode?: DashboardMode;
}

export interface OnboardingPayload {
  catalog_kind: CatalogKind;
  dashboard_mode: DashboardMode;
}

export function useShop() {
  return useQuery({
    queryKey: qk.shop.all,
    queryFn: () => apiFetch<Shop>('/shop/'),
  });
}

export function useUpdateShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ShopUpdateData) =>
      apiFetch<Shop>('/shop/', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shop.all }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shop.all }),
  });
}

export function useDeleteShopLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<Shop>('/shop/logo/', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shop.all }),
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OnboardingPayload) =>
      apiFetch<Shop>('/shop/onboarding/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      // `me.membership` contient onboarding_completed_at — il faut l'invalider
      // pour que le gating dans (app)/layout débloque l'accès au dashboard.
      qc.invalidateQueries({ queryKey: qk.shop.all });
      qc.invalidateQueries({ queryKey: qk.me.all });
    },
  });
}
