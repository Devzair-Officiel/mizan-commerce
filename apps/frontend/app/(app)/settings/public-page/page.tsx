'use client';

import { TopBar } from '@/components/layout/TopBar';
import { CreatePageCard } from '@/components/public-page-admin/CreatePageCard';
import { CatalogCard } from '@/components/public-page-admin/CatalogCard';
import { ContactsCard } from '@/components/public-page-admin/ContactsCard';
import { IdentityCard } from '@/components/public-page-admin/IdentityCard';
import { MessageTemplateCard } from '@/components/public-page-admin/MessageTemplateCard';
import { PreviewCard } from '@/components/public-page-admin/PreviewCard';
import { SectionsCard } from '@/components/public-page-admin/SectionsCard';
import { StatusBar } from '@/components/public-page-admin/StatusBar';
import { usePublicPage } from '@/lib/hooks/usePublicPageAdmin';

export default function PublicPageSettings() {
  const { data, isLoading, isError } = usePublicPage();

  return (
    <>
      <TopBar title="Page publique" />

      <div className="flex flex-col gap-4 px-4 pt-4 pb-32">
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-12">Chargement…</p>
        )}

        {isError && (
          <p className="text-sm text-destructive text-center py-12">
            Impossible de charger les informations de la page.
          </p>
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
