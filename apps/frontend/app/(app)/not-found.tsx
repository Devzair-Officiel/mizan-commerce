import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';

export default async function NotFound() {
  const t = await getTranslations('ui.not_found');
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{t('code')}</p>
      <h1 className="text-2xl font-semibold text-foreground">
        {t('title')}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('body')}
      </p>
      <Link href="/dashboard" className={buttonVariants({ variant: 'default' })}>
        {t('back')}
      </Link>
    </div>
  );
}
