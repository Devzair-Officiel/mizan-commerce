'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { ShowMoreList } from '@/components/ui/ShowMoreList';
import { useShop } from '@/lib/hooks/useShop';
import { useLinkedReminders } from '@/lib/hooks/useReminders';
import { ReminderRowMeta } from './list/ReminderRowMeta';
import { useReminderActions } from './list/useReminderActions';

interface RemindersCardProps {
  /** Fiche qui affiche la carte : ses rappels en attente, et le formulaire pré-rempli avec elle. */
  link: 'customer' | 'order';
  id: string;
}

/** Carte « Rappels » d'une fiche client ou commande : case ronde pour terminer, titre vers la modification. */
export function RemindersCard({ link, id }: RemindersCardProps) {
  const t = useTranslations('reminders.card');
  const list = useLinkedReminders(link, id);
  const tList = useTranslations('reminders.list');
  const { data: shop } = useShop();
  const actions = useReminderActions();
  const add = (
    <Link href={`/reminders/new?${link}=${id}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
      <Plus size={14} aria-hidden />{t('add_cta')}
    </Link>
  );

  return (
    <SectionCard title={t('title')} rightSlot={add}>
      {list.items.length > 0 ? (
        <ShowMoreList list={list} kind="reminders">
          <ul className="divide-y divide-border">
            {list.items.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3 lg:px-5">
                <button type="button" role="checkbox" aria-checked={false} aria-label={tList('done_aria', { title: r.title })}
                  onClick={() => actions.toggleDone(r)}
                  className="mt-0.5 size-5.5 shrink-0 rounded-full border-2 border-border bg-card transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <div className="min-w-0 flex-1">
                  <Link href={`/reminders/${r.id}/edit`} className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">
                    {r.title}
                  </Link>
                  <ReminderRowMeta reminder={r} currency={shop?.currency ?? 'EUR'} />
                </div>
              </li>
            ))}
          </ul>
        </ShowMoreList>
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground lg:px-5">{list.isLoading ? '' : t(link === 'customer' ? 'empty_customer' : 'empty_order')}</p>
      )}
    </SectionCard>
  );
}
