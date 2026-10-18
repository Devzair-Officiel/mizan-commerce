import { Plus } from 'lucide-react';

/** Ajout d'une ligne sous une liste : pilule en pointillés, pleine largeur. */
export function AddLineButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed border-border text-sm font-semibold whitespace-nowrap text-primary outline-none active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-primary/30">
      <Plus className="size-4" aria-hidden />
      {label}
    </button>
  );
}
