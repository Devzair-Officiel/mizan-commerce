import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export interface Me {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  email_verified_at: string | null;
  created_at: string;
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
