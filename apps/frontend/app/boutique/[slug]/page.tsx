import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageCatalog } from '@/components/public-page/PageCatalog';
import { PageContacts } from '@/components/public-page/PageContacts';
import { PageDescription } from '@/components/public-page/PageDescription';
import { PageHeader } from '@/components/public-page/PageHeader';
import { fetchPublicPage } from '@/lib/public-page-fetch';
import type { PublicPageData, PublicSection } from '@/lib/public-page-types';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchPublicPage(slug);
  if (!page) return { title: 'Boutique introuvable' };
  const title = page.display_name || page.shop_name;
  const description = page.tagline || page.description.slice(0, 160) || `Découvrez ${title}.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: page.cover_url ? [{ url: page.cover_url }] : undefined,
    },
  };
}

function renderSection(section: PublicSection, page: PublicPageData) {
  switch (section.type) {
    case 'header':
      return <PageHeader key={section.id} page={page} />;
    case 'description':
      return <PageDescription key={section.id} section={section} page={page} />;
    case 'products':
      return (
        <PageCatalog
          key={section.id}
          section={section}
          items={page.products}
          currency={page.currency}
          primaryContact={page.primary_contact}
          shopName={page.display_name || page.shop_name}
          messageTemplate={page.order_message_template}
          fallbackTitle="Nos produits"
        />
      );
    case 'services':
      return (
        <PageCatalog
          key={section.id}
          section={section}
          items={page.services}
          currency={page.currency}
          primaryContact={page.primary_contact}
          shopName={page.display_name || page.shop_name}
          messageTemplate={page.order_message_template}
          fallbackTitle="Nos services"
        />
      );
    case 'contact':
      return <PageContacts key={section.id} section={section} contacts={page.contacts} />;
    default:
      return null;
  }
}

export default async function BoutiquePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const isPreview = preview === '1';
  const page = await fetchPublicPage(slug, { preview: isPreview });
  if (!page) notFound();

  const orderedSections = [...page.sections].sort((a, b) => a.position - b.position);

  return (
    <main
      data-public-page=""
      className="flex flex-col min-h-screen bg-white text-neutral-900"
      style={{ ['--page-primary' as string]: page.primary_color }}
    >
      {isPreview && !page.is_published && (
        <div className="bg-amber-100 text-amber-900 text-xs text-center py-1.5 font-medium">
          Aperçu — page non publiée
        </div>
      )}
      {orderedSections.map((section) => renderSection(section, page))}
      <footer className="mt-auto py-6 text-center text-xs text-neutral-500">
        Propulsé par Mizan
      </footer>
    </main>
  );
}
