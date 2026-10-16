import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface StickyActionBarProps {
  isDirty: boolean;
  isPending: boolean;
  onReset: () => void;
}

export function StickyActionBar({ isDirty, isPending, onReset }: StickyActionBarProps) {
  const t = useTranslations('settings.actions');
  if (!isDirty) return null;
  return (
    <div data-settings-actions className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 w-full lg:bottom-4">
      <div className="flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
        <p role="status" className="me-auto text-xs font-medium text-muted-foreground max-sm:w-full">
          {t('unsaved')}
        </p>
        <Button type="button" variant="ghost" className="h-11 rounded-full active:scale-[0.98]" disabled={isPending} onClick={onReset}>
          {t('cancel')}
        </Button>
        <Button type="submit" className="h-11 rounded-full active:scale-[0.98]" disabled={isPending}>
          {isPending ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}
