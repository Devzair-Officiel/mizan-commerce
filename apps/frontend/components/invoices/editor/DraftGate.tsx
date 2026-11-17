'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { buttonVariants } from '@/components/ui/button';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { DRAFT_KINDS, type DraftDocuments, type DraftKind } from '@/lib/hooks/useDocumentDrafts';
import type { Shop } from '@/lib/hooks/useShop';
import { cn } from '@/lib/utils';
import { InvoiceEditor } from './InvoiceEditor';

interface DraftGateProps<K extends DraftKind> {
  kind: K;
  draft: DraftDocuments[K];
  shop: Shop;
}

/** Brouillon ou non, décidé au chargement : le document terminé depuis l'éditeur ne le démonte pas avant la redirection. */
export function DraftGate<K extends DraftKind>({ kind, draft, shop }: DraftGateProps<K>) {
  const t = useTranslations('invoices.editor');
  const { route } = DRAFT_KINDS[kind];
  const back = useBackOr(route);
  const [editable] = useState(draft.status === 'draft');
  if (editable) return <InvoiceEditor kind={kind} draft={draft} shop={shop} />;
  return <><TopBar title={t('title', { doc: kind })} back backLabel={t('back', { doc: kind })} onBack={back} hideSearch />
    <div className="flex flex-col items-start gap-3 p-4"><p className="text-sm text-muted-foreground">{t('not_draft', { doc: kind })}</p>
      <Link href={`${route}/${draft.id}`} className={cn(buttonVariants(), 'h-11 rounded-full px-5')}>{t('open_document', { doc: kind })}</Link></div></>;
}
