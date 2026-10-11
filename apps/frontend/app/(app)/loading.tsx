import { getTranslations } from 'next-intl/server';
import { Loader2 } from 'lucide-react';

export default async function Loading() {
  const t = await getTranslations('ui.loading');
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="text-sm">{t('label')}</span>
      <span className="sr-only" role="status">{t('status')}</span>
    </div>
  );
}
