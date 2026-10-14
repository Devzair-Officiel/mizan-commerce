'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useIsAdmin } from '@/lib/hooks/useMe';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useReminderSettings, useUpdateReminderSettings, type ReminderSettings } from '@/lib/hooks/useReminders';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { ReminderDelaysDialog } from './ReminderDelaysDialog';

type SwitchKey = 'unpaid_followup_enabled' | 'pending_orders_enabled' | 'daily_summary_enabled';

function AutoSwitch({ label, text, checked, disabled, onChange }: {
  label: string; text: ReactNode; checked: boolean; disabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-border pt-3.5 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">{text}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'bg-primary' : 'bg-input')}>
        <span className={cn('size-4.5 rounded-full shadow transition-[margin]', checked ? 'ms-4.75 bg-primary-foreground' : 'ms-0.75 bg-card')} />
      </button>
    </div>
  );
}

/** Carte « Rappels automatiques » : trois interrupteurs ; lecture seule pour les employés. Repliable sur mobile. */
export function AutomaticRemindersCard() {
  const t = useTranslations('reminders.auto');
  const isAdmin = useIsAdmin();
  const isDesktop = useIsDesktop();
  const { data: settings } = useReminderSettings();
  const update = useUpdateReminderSettings();
  const [expanded, setExpanded] = useState(false);
  const [delaysOpen, setDelaysOpen] = useState(false);
  const open = isDesktop !== false || expanded;
  const b = (chunks: ReactNode) => <b className="font-semibold text-foreground">{chunks}</b>;
  const toggle = (key: SwitchKey, value: boolean) => update.mutate({ [key]: value } as Partial<ReminderSettings>, {
    onError: () => notify.error(t('save_failed')),
  });

  const header = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card text-primary shadow-sm"><Sparkles size={18} aria-hidden /></span>
      <span className="min-w-0 flex-1 text-start">
        <span className="block text-base font-semibold text-foreground">{t('title')}</span>
        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted-foreground">{t('subtitle')}</span>
      </span>
    </>
  );

  return (
    <section aria-label={t('title')} className="overflow-hidden rounded-2xl border border-border bg-card">
      {isDesktop === false ? (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
          className={cn('header-band flex w-full items-center gap-3 px-5 py-3.5', expanded && 'border-b border-border')}>
          {header}
          <ChevronDown size={18} aria-hidden className={cn('shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </button>
      ) : (
        <div className="header-band flex items-center gap-3 border-b border-border px-5 py-3.5">{header}</div>
      )}
      {open && settings && (
        <div className="flex flex-col gap-3.5 p-5">
          <AutoSwitch label={t('unpaid_label')} checked={settings.unpaid_followup_enabled} disabled={!isAdmin}
            text={t.rich('unpaid_text', { days: settings.unpaid_followup_days, b })} onChange={(v) => toggle('unpaid_followup_enabled', v)} />
          <AutoSwitch label={t('pending_label')} checked={settings.pending_orders_enabled} disabled={!isAdmin}
            text={t.rich('pending_text', { days: settings.pending_orders_days, b })} onChange={(v) => toggle('pending_orders_enabled', v)} />
          <AutoSwitch label={t('summary_label')} checked={settings.daily_summary_enabled} disabled={!isAdmin}
            text={t.rich('summary_text', { hour: settings.daily_summary_hour, b })} onChange={(v) => toggle('daily_summary_enabled', v)} />
          {isAdmin ? (
            <button type="button" onClick={() => setDelaysOpen(true)}
              className="self-start text-[0.8125rem] font-semibold text-primary underline-offset-4 hover:underline">
              {t('delays_link')}
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">{t('read_only')}</p>
          )}
        </div>
      )}
      {delaysOpen && settings && <ReminderDelaysDialog settings={settings} onClose={() => setDelaysOpen(false)} />}
    </section>
  );
}
