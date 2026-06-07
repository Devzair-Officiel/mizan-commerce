'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cache "frais" pendant 1 min — évite les refetch sur navigations rapides.
            staleTime: 60 * 1000,
            // Données conservées en mémoire 5 min après dernier consumer.
            gcTime: 5 * 60 * 1000,
            // Sur mobile, le focus se déclenche en permanence — refetch trop agressif.
            refetchOnWindowFocus: false,
            // Mobile = réseaux instables : on rafraîchit au retour de connexion.
            refetchOnReconnect: true,
            retry: 1,
            // Backoff exponentiel borné à 30s.
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
          },
          mutations: {
            // Pas de retry auto sur les mutations — risque de double-soumission
            // (ex: créer 2 commandes, débiter 2 fois). À gérer explicitement côté caller.
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
