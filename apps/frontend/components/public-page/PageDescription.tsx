import type { PublicPageData, PublicSection } from '@/lib/public-page-types';

interface Props {
  section: PublicSection;
  page: PublicPageData;
}

export function PageDescription({ section, page }: Props) {
  const content = section.content.trim() || page.description.trim();
  if (!content) return null;
  return (
    <section className="px-4 py-6 sm:py-10 max-w-2xl mx-auto">
      {section.title && (
        <h2 className="text-xl font-semibold mb-3 text-center">{section.title}</h2>
      )}
      <p className="text-sm sm:text-base leading-relaxed text-neutral-700 whitespace-pre-line text-center">
        {content}
      </p>
    </section>
  );
}
