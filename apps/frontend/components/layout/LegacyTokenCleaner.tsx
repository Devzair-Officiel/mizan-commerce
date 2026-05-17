'use client';

import { useEffect } from 'react';

/** Supprime les anciens tokens JWT stockés en localStorage (migration sécurité). */
export function LegacyTokenCleaner() {
  useEffect(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }, []);
  return null;
}
