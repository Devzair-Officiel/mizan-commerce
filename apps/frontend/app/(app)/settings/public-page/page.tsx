'use client';

import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { FeatureGate } from '@/components/subscription/FeatureGate';
import { CreatePageCard } from '@/components/public-page-admin/CreatePageCard';
import { CatalogCard } from '@/components/public-page-admin/CatalogCard';
import { ContactsCard } from '@/components/public-page-admin/ContactsCard';
import { IdentityCard } from '@/components/public-page-admin/IdentityCard';
import { MessageTemplateCard } from '@/components/public-page-admin/MessageTemplateCard';
import { PreviewCard } from '@/components/public-page-admin/PreviewCard';
import { SectionsCard } from '@/components/public-page-admin/SectionsCard';
import { StatusBar } from '@/components/public-page-admin/StatusBar';
import { usePublicPage } from '@/lib/hooks/usePublicPageAdmin';
import { SectionsSkeleton } from '@/components/ui/SectionsSkeleton';

export default function PublicPageSettings() {
  const t = useTranslations('settings.public_page');
  return (
    <FeatureGate feature="public_pages" title={t('title')}>
      <PublicPageContent />
    </FeatureGate>
  );
}

function PublicPageContent() {
  const t = useTranslations('settings.public_page');
  const { data, isLoading, isError } = usePublicPage();

  return (
    <>
      <TopBar title={t('title')} />

      <div className="flex flex-col gap-4 px-4 pt-4 pb-32">
        {isLoading && <SectionsSkeleton sections={[1, 3, 2]} />}

        {isError && (
          <p className="text-sm text-destructive text-center py-12">{t('error')}</p>
        )}

        {data && !data.exists && (
          <CreatePageCard
            suggestedSlug={data.suggested_slug}
            suggestedDisplayName={data.suggested_display_name}
          />
        )}

        {data && data.exists && (
          <>
            <StatusBar page={data.page} />
            <PreviewCard page={data.page} />
            <IdentityCard page={data.page} />
            <SectionsCard page={data.page} />
            <CatalogCard page={data.page} />
            <ContactsCard page={data.page} />
            <MessageTemplateCard page={data.page} />
          </>
        )}
      </div>
    </>
  );
}
