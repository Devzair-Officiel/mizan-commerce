'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { draftError } from '@/lib/hooks/useDocumentDrafts';
import { useConvertQuote, useQuote, useUpdateQuoteStatus, type Quote } from '@/lib/hooks/useQuotes';
import { notify } from '@/lib/notify';

export type QuoteSheet = 'accept' | 'decline' | null;

/** Un geste à la fois : un double clic ne relance pas la requête en cours. */
function useOnce() {
  const running = useRef(false);
  return useCallback(async (task: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    try { await task(); } finally { running.current = false; }
  }, []);
}

/** Erreur traduite ; un 409 relit le devis, et un devis expiré entre-temps a son propre message. */
function useQuoteFailure(refetch: () => Promise<{ data?: Quote }>) {
  const t = useTranslations('quotes.errors');
  return useCallback(async (err: unknown) => {
    let { code } = draftError(err);
    if (code === 'invalid_status' && (await refetch()).data?.status === 'expired') code = 'expired';
    return { changed: code === 'invalid_status' || code === 'expired', message: t('message', { code: code ?? 'other' }) };
  }, [refetch, t]);
}

/** Devis affiché et ses gestes : accord, refus, conversion en facture (transitions idempotentes côté serveur). */
export function useQuoteDetailState(id: string) {
  const query = useQuote(id);
  const update = useUpdateQuoteStatus(id);
  const convert = useConvertQuote(id);
  const router = useRouter();
  const t = useTranslations('quotes');
  const [sheet, setSheet] = useState<QuoteSheet>(null);
  const once = useOnce();
  const failure = useQuoteFailure(query.refetch);

  /** Signale l'échec ; le devis a changé : la feuille se ferme sur l'état relu (`null`), sinon le message. */
  const fail = async (err: unknown): Promise<string | null> => {
    const { changed, message } = await failure(err);
    notify.error(message);
    if (changed) setSheet(null);
    return changed ? null : message;
  };

  const accept = (name: string) => once(async () => {
    try {
      await update.mutateAsync({ status: 'accepted', accepted_name: name });
      setSheet(null);
      notify.success(t('accept.done'));
    } catch (err) { await fail(err); }
  });
  const decline = () => once(async () => {
    try {
      await update.mutateAsync({ status: 'declined' });
      setSheet(null);
      notify.success(t('decline.done'));
    } catch (err) {
      const message = await fail(err);
      if (message) throw new Error(message);
    }
  });
  const toInvoice = () => once(async () => {
    try {
      const invoice = await convert.mutateAsync();
      notify.success(t('convert.done'));
      router.push(`/invoices/${invoice.id}/edit`);
    } catch (err) { await fail(err); }
  });

  // Conversion réussie : le bouton reste désactivé jusqu'à l'ouverture de l'éditeur de facture.
  const pending = update.isPending || convert.isPending || convert.isSuccess;
  return { quote: query.data, isLoading: query.isLoading, sheet, setSheet, pending, accept, decline, toInvoice };
}
export type QuoteDetailState = ReturnType<typeof useQuoteDetailState>;
