import { Button } from '@/components/ui/button';

interface StickyActionBarProps {
  isDirty: boolean;
  isPending: boolean;
  onReset: () => void;
}

export function StickyActionBar({ isDirty, isPending, onReset }: StickyActionBarProps) {
  return (
    <div
      aria-hidden={!isDirty}
      className={`fixed left-0 right-0 z-40 px-4 pb-safe pointer-events-none transition-[transform,opacity] duration-200 bottom-16 lg:bottom-4 lg:left-60 ${
        isDirty ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <div className={`mx-auto max-w-xl flex items-center gap-2 rounded-2xl border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-lg ${isDirty ? 'pointer-events-auto' : ''}`}>
        <p className="flex-1 text-xs font-medium text-muted-foreground px-1">
          Modifications non enregistrées
        </p>
        <Button type="button" variant="ghost" disabled={isPending} onClick={onReset}>
          Annuler
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
