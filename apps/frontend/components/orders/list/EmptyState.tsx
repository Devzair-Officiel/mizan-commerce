import { Receipt } from 'lucide-react';

export function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Receipt size={20} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">
        {filtered ? 'Aucune commande pour ce filtre' : 'Aucune commande'}
      </p>
      <p className="text-xs text-muted-foreground text-center max-w-[16rem]">
        {filtered
          ? 'Essaie un autre statut ou retire le filtre.'
          : 'Crée ta première commande pour démarrer.'}
      </p>
    </div>
  );
}
