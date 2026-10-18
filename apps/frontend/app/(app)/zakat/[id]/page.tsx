'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { SectionsSkeleton } from '@/components/ui/SectionsSkeleton';
import { parseStep } from '@/components/zakat/wizard/stepNav';
import { ZakatWizard } from '@/components/zakat/wizard/ZakatWizard';
import { useZakatCalculation } from '@/lib/hooks/useZakat';

function ZakatCalculationScreen() {
  const t = useTranslations('zakat');
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const step = parseStep(useSearchParams().get('etape'));
  const { data: calc, isLoading } = useZakatCalculation(id);

  if (calc) {
    // Une étape pas encore atteinte (adresse saisie à la main) : on reste sur la première étape à faire.
    return <ZakatWizard key={calc.id} calc={calc} step={Math.min(step, calc.current_step)} />;
  }
  return (
    <div className="mx-auto w-full max-w-280">
      <TopBar title={t('home.title')} back backLabel={t('wizard.back')} onBack={() => router.push('/zakat')} hideSearch />
      <div className="px-4 pt-2 lg:pt-0">
        {isLoading ? <SectionsSkeleton sections={[2, 3]} /> : (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-sm">
            <p>{t('common.not_found')}</p>
            <Link href="/zakat" className="font-semibold text-primary underline-offset-4 hover:underline">{t('common.back_home')}</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ZakatCalculationPage() {
  return (
    <Suspense>
      <ZakatCalculationScreen />
    </Suspense>
  );
}
