import { Button } from '@/components/ui/button';

interface SubmitCTAProps {
  isPending: boolean;
  hasItems: boolean;
  total: number;
  onClick: () => void | Promise<void>;
}

export function SubmitCTA({ isPending, hasItems, total, onClick }: SubmitCTAProps) {
  return (
    <div className="fixed bottom-20 left-0 right-0 lg:left-60 lg:bottom-0 z-30 px-4 pt-4 pb-3 pointer-events-none">
      <Button
        onClick={onClick}
        disabled={isPending}
        className="w-full rounded-full pointer-events-auto shadow-[0_8px_20px_-6px_rgba(0,0,0,0.22)]"
      >
        {isPending ? (
          'Création…'
        ) : (
          <span className="flex items-center justify-center gap-2">
            <span>Créer la commande</span>
            {hasItems && (
              <>
                <span className="opacity-60">·</span>
                <span className="tabular-nums font-semibold">{total.toFixed(2)} €</span>
              </>
            )}
          </span>
        )}
      </Button>
    </div>
  );
}
