import { contactHref, contactLabel } from '@/lib/contact-url';
import type { PublicContact, PublicSection } from '@/lib/public-page-types';

interface Props {
  section: PublicSection;
  contacts: PublicContact[];
}

const ICONS: Record<PublicContact['type'], string> = {
  whatsapp: 'WA',
  telegram: 'TG',
  instagram: 'IG',
  phone: 'TEL',
};

export function PageContacts({ section, contacts }: Props) {
  if (contacts.length === 0) return null;
  const title = section.title.trim() || 'Nous contacter';

  return (
    <section className="px-4 py-8 sm:py-12 max-w-2xl mx-auto w-full">
      <h2 className="text-xl font-semibold mb-3 text-center text-neutral-900">{title}</h2>
      {section.content && (
        <p className="text-sm text-neutral-600 mb-6 text-center whitespace-pre-line">
          {section.content}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2.5">
        {contacts.map((contact) => (
          <a
            key={contact.id}
            href={contactHref(contact)}
            target={contact.type === 'phone' ? undefined : '_blank'}
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
          >
            <span
              className="inline-flex items-center justify-center h-7 w-7 rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: 'var(--page-primary)' }}
            >
              {ICONS[contact.type]}
            </span>
            <span>{contactLabel(contact)}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
