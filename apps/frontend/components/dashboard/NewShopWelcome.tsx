'use client';

import Link from 'next/link';
import { ShoppingBag, Package, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { type ReactNode } from 'react';

interface Props { productsCount: number; customersCount: number; }

export function NewShopWelcome({ productsCount, customersCount }: Props) {
  const t = useTranslations('dashboard.welcome');
  const kind = useCatalogKind();
  return (
    <div className="flex flex-col items-center gap-6 py-8 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <ShoppingBag className="h-8 w-8 text-primary" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground max-w-xs">{t('sub')}</p>
      </div>
      <Button render={<Link href="/orders/new" />} size="lg" className="rounded-full px-8">
        {t('cta')}
      </Button>
      <div className="flex flex-col gap-2 w-full max-w-xs text-start">
        <SetupItem
          done={productsCount > 0}
          icon={<Package size={15} />}
          href="/products"
          label={productsCount > 0 ? t('products_done', { count: productsCount, kind }) : t('add_products', { kind })}
        />
        <SetupItem
          done={customersCount > 0}
          icon={<Users size={15} />}
          href="/customers"
          label={customersCount > 0 ? t('customers_done', { count: customersCount }) : t('add_customers')}
        />
      </div>
    </div>
  );
}

function SetupItem({
  done, icon, label, href,
}: { done: boolean; icon: ReactNode; label: string; href: string }) {
  const base = 'flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5';
  const iconClass = `flex h-6 w-6 items-center justify-center rounded-full text-xs ${
    done ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'
  }`;
  const inner = (
    <>
      <span className={iconClass}>{done ? '✓' : icon}</span>
      <span className="flex-1 text-sm text-foreground">{label}</span>
    </>
  );
  if (done) return <div className={`${base} opacity-70`}>{inner}</div>;
  return (
    <Link href={href} className={`${base} hover:bg-muted active:bg-muted transition-colors`}>
      {inner}
    </Link>
  );
}
