import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { BadgeKey } from '@/lib/navigation';

export type NavBadges = Partial<Record<BadgeKey, number>>;

export function useNavBadges() {
  return useQuery({
    queryKey: qk.navBadges.all,
    queryFn: () => apiFetch<NavBadges>('/dashboard/badges/'),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
