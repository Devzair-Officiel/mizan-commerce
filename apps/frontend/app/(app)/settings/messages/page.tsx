'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { MessageTemplatesForm } from '@/components/settings/messages/MessageTemplatesForm';
import { FeatureGate } from '@/components/subscription/FeatureGate';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { MESSAGE_TEMPLATES, useMessageSettings, type MessageTemplateKey } from '@/lib/hooks/useMessageTemplates';

const isTemplate = (value: string | null): value is MessageTemplateKey =>
  (MESSAGE_TEMPLATES as readonly (string | null)[]).includes(value);

/** Ouverte depuis un message préparé (`?template=`) : ce modèle est affiché d'emblée. */
function MessageSettingsContent() {
  const t = useTranslations('settings.messages');
  const tNav = useTranslations('layout.nav');
  const template = useSearchParams().get('template');
  const { data: settings, isError } = useMessageSettings();
  const back = useBackOr('/settings');

  return (
    <div className="mx-auto w-full max-w-280">
      <TopBar title={t('title')} subtitle={t('subtitle')} back backLabel={tNav('settings')} onBack={back} hideSearch />
      {settings ? (
        <MessageTemplatesForm settings={settings} initialTemplate={isTemplate(template) ? template : 'order_confirmation'} onLeave={back} />
      ) : isError ? (
        <p className="px-4 py-12 text-center text-sm text-destructive">{t('load_failed')}</p>
      ) : (
        <div className="mx-4 h-96 animate-pulse rounded-2xl bg-muted" />
      )}
    </div>
  );
}

export default function MessageSettingsPage() {
  const t = useTranslations('settings.messages');
  return (
    <FeatureGate feature="whatsapp" title={t('title')} back>
      <Suspense>
        <MessageSettingsContent />
      </Suspense>
    </FeatureGate>
  );
}
