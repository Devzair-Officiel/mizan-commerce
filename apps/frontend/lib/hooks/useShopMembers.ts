import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { ModuleKey, ShopRole } from '@/lib/hooks/useMe';

export interface ShopMember {
  id: string;
  user: string;
  user_email: string;
  user_full_name: string;
  user_phone: string;
  role: ShopRole;
  permissions: ModuleKey[];
  created_at: string;
}

export interface CreateMemberPayload {
  email: string;
  full_name: string;
  phone?: string;
  password: string;
  permissions: ModuleKey[];
}

export interface UpdateMemberPayload {
  role?: 'admin' | 'staff';
  permissions?: ModuleKey[];
}

interface PaginatedShopMembers {
  count: number;
  next: string | null;
  previous: string | null;
  results: ShopMember[];
}

export function useShopMembers() {
  return useQuery({
    queryKey: qk.shopMembers.all,
    queryFn: () => apiFetch<PaginatedShopMembers>('/shop/members/'),
    select: (data) => data.results,
  });
}

export function useCreateShopMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMemberPayload) =>
      apiFetch<ShopMember>('/shop/members/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shopMembers.all }),
  });
}

export function useUpdateShopMember(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateMemberPayload) =>
      apiFetch<ShopMember>(`/shop/members/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shopMembers.all }),
  });
}

export function useDeleteShopMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/shop/members/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shopMembers.all }),
  });
}
