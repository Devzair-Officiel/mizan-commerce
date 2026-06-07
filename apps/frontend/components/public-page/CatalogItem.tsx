import type { PublicCatalogItem, PublicContact } from '@/lib/public-page-types';
import { OrderButton } from './OrderButton';

interface Props {
  item: PublicCatalogItem;
  currency: string;
  primaryContact: PublicContact | null;
  shopName: string;
  messageTemplate: string;
}

function formatPrice(price: string | null, currency: string): string | null {
  if (!price) return null;
  const value = Number(price);
  if (Number.isNaN(value)) return null;
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function CatalogItem({ item, currency, primaryContact, shopName, messageTemplate }: Props) {
  const priceLabel = item.show_price
    ? (formatPrice(item.price, currency) ?? 'Sur devis')
    : null;
  const isService = item.type === 'service';

  return (
    <article className="group rounded-2xl bg-white border border-neutral-200 overflow-hidden flex flex-col transition-shadow hover:shadow-md">
      {item.image_url ? (
        <div className="relative aspect-square w-full bg-neutral-100 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image_url}
            alt={item.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {(item.badge_promo || item.badge_new || item.is_out_of_stock) && (
            <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
              {item.badge_promo && <Badge tone="rose">Promo</Badge>}
              {item.badge_new && <Badge tone="emerald">Nouveau</Badge>}
              {item.is_out_of_stock && <Badge tone="neutral">Rupture</Badge>}
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-square w-full bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm">
          {isService ? 'Service' : 'Produit'}
        </div>
      )}

      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold leading-snug text-neutral-900 line-clamp-2">
          {item.name}
        </h3>
        {item.description && (
          <p className="text-xs text-neutral-500 line-clamp-2">{item.description}</p>
        )}
        {priceLabel && (
          <p
            className="text-base font-bold mt-1"
            style={{ color: 'var(--page-primary)' }}
          >
            {priceLabel}
          </p>
        )}
        {primaryContact && (
          <div className="mt-2">
            <OrderButton
              contact={primaryContact}
              itemName={item.name}
              priceLabel={priceLabel}
              shopName={shopName}
              messageTemplate={messageTemplate}
            />
          </div>
        )}
      </div>
    </article>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'rose' | 'emerald' | 'neutral' }) {
  const styles = {
    rose: 'bg-rose-500 text-white',
    emerald: 'bg-emerald-500 text-white',
    neutral: 'bg-neutral-800 text-white',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${styles[tone]}`}>
      {children}
    </span>
  );
}
