import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean | undefined {
  return useSyncExternalStore<boolean | undefined>(
    (cb) => {
      if (typeof window === 'undefined') return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => undefined,
  );
}

export function useIsDesktop(): boolean | undefined {
  return useMediaQuery('(min-width: 1024px)');
}
