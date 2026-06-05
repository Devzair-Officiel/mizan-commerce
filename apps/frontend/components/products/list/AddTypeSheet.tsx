import { useEffect } from 'react';
import { ChevronRight, Package, Sparkles, X } from 'lucide-react';
import type { ProductType } from '@/lib/hooks/useProducts';

interface AddTypeSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (type: ProductType) => void;
}

export function AddTypeSheet({ open, onClose, onPick }: AddTypeSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-70 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ajouter un article"
        className={`fixed inset-x-0 bottom-0 z-80 rounded-t-3xl bg-card shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mt-3 mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-lg font-semibold text-foreground">Ajouter au catalogue</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-8 pt-2 flex flex-col gap-3">
          <AddTypeCard
            icon={<Package size={20} />}
            title="Produit"
            subtitle="Article physique avec stock à suivre"
            onClick={() => onPick('product')}
          />
          <AddTypeCard
            icon={<Sparkles size={20} />}
            title="Service"
            subtitle="Prestation sans gestion de stock"
            onClick={() => onPick('service')}
          />
        </div>
      </div>
    </>
  );
}

function AddTypeCard({
  icon, title, subtitle, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left active:scale-[0.98] transition-transform hover:bg-muted/40"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-base font-semibold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <ChevronRight size={18} className="text-muted-foreground shrink-0" />
    </button>
  );
}
