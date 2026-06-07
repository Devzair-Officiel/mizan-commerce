import type { PublicCatalogItem, PublicContact, PublicSection } from '@/lib/public-page-types';
import { CatalogItem } from './CatalogItem';

interface Props {
  section: PublicSection;
  items: PublicCatalogItem[];
  currency: string;
  primaryContact: PublicContact | null;
  shopName: string;
  messageTemplate: string;
  fallbackTitle: string;
}

export function PageCatalog({
  section,
  items,
  currency,
  primaryContact,
  shopName,
  messageTemplate,
  fallbackTitle,
}: Props) {
  if (items.length === 0) return null;
  const title = section.title.trim() || fallbackTitle;

  return (
    <section className="px-4 py-6 sm:py-10 max-w-5xl mx-auto w-full">
      <h2 className="text-xl font-semibold mb-4 text-center">{title}</h2>
      {section.content && (
        <p className="text-sm text-neutral-600 mb-5 text-center whitespace-pre-line">
          {section.content}
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {items.map((item) => (
          <CatalogItem
            key={item.id}
            item={item}
            currency={currency}
            primaryContact={primaryContact}
            shopName={shopName}
            messageTemplate={messageTemplate}
          />
        ))}
      </div>
    </section>
  );
}
