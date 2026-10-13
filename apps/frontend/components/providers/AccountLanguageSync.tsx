'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { isLocale } from '@/i18n/locales';
import { useMe, useUpdateMe } from '@/lib/hooks/useMe';

/**
 * La langue de l'interface (cookie) est enregistrée sur le compte : le résumé du
 * jour et les rappels automatiques, écrits hors requête, l'utilisent.
 */
export function AccountLanguageSync() {
  const locale = useLocale();
  const { data: me, isFetching } = useMe();
  const updateMe = useUpdateMe();
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (!me || isFetching || !isLocale(locale) || me.language === locale) return;
    const key = `${me.id}:${locale}`;
    if (synced.current === key) return;
    synced.current = key;
    updateMe.mutate({ language: locale });
  }, [isFetching, locale, me, updateMe]);

  return null;
}
