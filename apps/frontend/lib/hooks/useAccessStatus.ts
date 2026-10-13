import { useQuery } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';

export type AccessStatus = 'checking' | 'suspended' | 'restored' | 'signed_out';

/**
 * Écran « Accès suspendu » : vérifie régulièrement (et au retour sur l'app) si la boutique
 * a repris Boutique+. Appel direct au proxy, sans `apiFetch` qui renverrait vers cet écran.
 */
export function useAccessStatus(): AccessStatus {
  const { data } = useQuery({
    queryKey: qk.me.access,
    queryFn: async (): Promise<AccessStatus> => {
      const res = await fetch('/api/proxy/auth/me/');
      if (res.ok) return 'restored';
      return res.status === 401 ? 'signed_out' : 'suspended';
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return data ?? 'checking';
}
