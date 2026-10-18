'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { FormField } from '@/components/form/FormField';
import { SectionCard } from '@/components/ui/SectionCard';
import { Switch } from '@/components/ui/Switch';
import type { ZakatProfile } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';
import type { ProfileAutosave } from './useProfileAutosave';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface SettingsHawlCardProps {
  profile: ZakatProfile;
  save: ProfileAutosave['save'];
  format: ZakatFormat;
}

/** Jour J habituel (les années suivantes en découlent, calculées par le serveur) et rappel par e-mail 7 jours avant. */
export function SettingsHawlCard({ profile, save, format }: SettingsHawlCardProps) {
  const t = useTranslations('zakat');
  const [date, setDate] = useState(profile.hawl_date ?? '');
  const invalid = date !== '' && !DAY_PATTERN.test(date);
  const next = profile.next_hawl;

  function change(value: string) {
    setDate(value);
    if (DAY_PATTERN.test(value)) save({ hawl_date: value });
  }

  return (
    <SectionCard title={t('settings.hawl_title')} description={t('settings.hawl_hint')}>
      <div className="flex flex-col gap-3 p-5">
        <div className="max-w-80">
          <FormField label={t('settings.hawl_date')} help={t('settings.hawl_help')}
            error={invalid ? t('steps.hawl.date_invalid') : undefined}>
            {(c) => <input {...c} type="date" value={date} onChange={(e) => change(e.target.value)} className={`${FIELD_CONTROL} tabular-nums`} />}
          </FormField>
        </div>
        {next && (
          <p className="text-sm font-semibold text-foreground">
            {t('settings.next', { date: format.date(next.date), hijri: format.hijri(next.hijri) })}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t('settings.reminder')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.reminder_help')}</p>
          </div>
          <Switch checked={profile.reminder_email_enabled} label={t('settings.reminder')}
            onChange={(checked) => save({ reminder_email_enabled: checked }, true)} />
        </div>
      </div>
    </SectionCard>
  );
}
