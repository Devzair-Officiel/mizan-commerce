import { useMemo } from 'react';
import { useLocale } from 'next-intl';

/**
 * Nom d'un pays (code ISO 3166-1 alpha-2) dans la langue de l'interface.
 * Une valeur qui n'est pas un code (ancienne saisie libre) est rendue telle quelle.
 */
export function useCountryNames(): (code: string) => string {
  const locale = useLocale();
  return useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    return (code: string) => (/^[A-Za-z]{2}$/.test(code) ? names.of(code.toUpperCase()) ?? code : code);
  }, [locale]);
}
