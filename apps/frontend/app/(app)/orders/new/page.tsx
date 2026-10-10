'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { NewSaleScreen } from '@/components/orders/new/NewSaleScreen';
import { useNewSaleForm } from '@/lib/hooks/useNewSaleForm';

function NewSaleForm() {
  const form = useNewSaleForm({ mode: 'create' });
  return <NewSaleScreen form={form} />;
}

export default function NewOrderPage() {
  const t = useTranslations('orders.new');
  const tList = useTranslations('orders.list');
  return (
    <>
      <TopBar title={t('topbar')} back backLabel={tList('topbar')} hideSearch />
      <Suspense>
        <NewSaleForm />
      </Suspense>
    </>
  );
}
