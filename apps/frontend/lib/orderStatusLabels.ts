import { useTranslations } from 'next-intl';
import { useShop } from './hooks/useShop';

export function useOrderStatusLabel() {
  const t = useTranslations('orders.statusLabel');
  const { data: shop } = useShop();

  return function label(status: string, plural = false): string {
    const ck = shop?.catalog_kind ?? 'both';
    const fm = shop?.fulfillment_mode ?? null;
    const sfx = plural ? '_pl' : '';

    switch (status) {
      case 'to_prepare':
        if (ck === 'services') return t(`to_prepare_services${sfx}` as 'to_prepare_services' | 'to_prepare_services_pl');
        if (ck === 'products') return t(`to_prepare_products${sfx}` as 'to_prepare_products' | 'to_prepare_products_pl');
        return t(`to_prepare_both${sfx}` as 'to_prepare_both' | 'to_prepare_both_pl');
      case 'prepared':
        return t(plural ? 'prepared_pl' : 'prepared');
      case 'shipped':
        if (ck === 'services') return t(plural ? 'shipped_services_pl' : 'shipped_services');
        if (fm === 'on_site') return t(plural ? 'shipped_on_site_pl' : 'shipped_on_site');
        if (fm === 'delivery') return t(plural ? 'shipped_delivery_pl' : 'shipped_delivery');
        return t(plural ? 'shipped_other_pl' : 'shipped_other');
      case 'cancelled':
        return t(plural ? 'cancelled_pl' : 'cancelled');
      default:
        return status;
    }
  };
}
