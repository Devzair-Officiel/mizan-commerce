import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export type ShopRole = 'owner' | 'admin' | 'staff';

export type ModuleKey =
  | 'products'
  | 'orders'
  | 'customers'
  | 'payments'
  | 'invoices'
  | 'stock'
  | 'messages'
  | 'dashboard';

export const TOGGLEABLE_MODULES: readonly ModuleKey[] = [
  'products', 'orders', 'customers', 'payments',
  'invoices', 'stock', 'messages', 'dashboard',
] as const;

export interface Membership {
  shop_id: string;
  shop_name: string;
  role: ShopRole;
  is_admin: boolean;
  permissions: ModuleKey[];
}

export interface Me {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  email_verified_at: string | null;
  created_at: string;
  membership: Membership | null;
}

export interface MeUpdateData {
  full_name?: string;
  phone?: string;
}

export interface ChangePasswordData {
  old_password: string;
  new_password: string;
}

export function useMe() {
  return useQuery({
    queryKey: qk.me.all,
    queryFn: () => apiFetch<Me>('/auth/me/'),
  });
}

/**
 * Vérifie si l'utilisateur courant a accès à un module donné.
 * - Admin (owner/admin) : toujours `true`.
 * - Staff : `true` uniquement si le module est dans `permissions`.
 * - Renvoie `false` tant que `useMe()` est en cours de chargement.
 */
export function useCan(module: ModuleKey): boolean {
  const { data } = useMe();
  const m = data?.membership;
  if (!m) return false;
  if (m.is_admin) return true;
  return m.permissions.includes(module);
}

/** Renvoie `true` si l'utilisateur est owner/admin de la boutique. */
export function useIsAdmin(): boolean {
  const { data } = useMe();
  return data?.membership?.is_admin ?? false;
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MeUpdateData) =>
      apiFetch<Me>('/auth/me/', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me.all }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordData) =>
      apiFetch<{ detail: string }>('/auth/change-password/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}
