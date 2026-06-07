import type { PublicPageData } from '@/lib/public-page-types';

interface Props {
  page: PublicPageData;
}

export function PageHeader({ page }: Props) {
  const hasCover = Boolean(page.cover_url);
  return (
    <header className="flex flex-col">
      {hasCover && (
        <div className="relative h-44 sm:h-60 w-full overflow-hidden bg-neutral-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={page.cover_url ?? ''}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      )}
      <div className="px-4 pt-6 pb-6 sm:pt-8 sm:pb-10 flex flex-col items-center text-center gap-3 max-w-2xl mx-auto w-full">
        {page.logo_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={page.logo_url}
            alt=""
            className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl object-cover shadow-md border border-neutral-200 bg-white"
          />
        )}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
          {page.display_name || page.shop_name}
        </h1>
        {page.tagline && (
          <p className="text-sm sm:text-base text-neutral-600">{page.tagline}</p>
        )}
      </div>
    </header>
  );
}
