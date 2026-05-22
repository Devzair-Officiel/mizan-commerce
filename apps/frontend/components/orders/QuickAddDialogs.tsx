'use client';

import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Plus, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import { useCreateCustomer, type Customer } from '@/lib/hooks/useCustomers';
import { useCreateProduct, type ProductDetail } from '@/lib/hooks/useProducts';
import { ApiError } from '@/lib/api-client';

/* ── styles partagés ── */
const overlayClass = 'fixed inset-0 bg-black/40 z-40 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 transition-opacity duration-200';
const popupClass = 'fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-card rounded-2xl shadow-xl p-5 flex flex-col gap-4 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 transition-[opacity,transform] duration-200';

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center w-11 h-11 rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary transition-colors shrink-0 self-stretch"
      aria-label="Ajouter"
    >
      <Plus size={18} />
    </button>
  );
}

function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <Dialog.Title className="text-base font-semibold text-foreground">{title}</Dialog.Title>
      <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
        <X size={18} />
      </button>
    </div>
  );
}

/* ─────────────────────────────────
   Quick add — Client
───────────────────────────────── */
export function QuickAddCustomer({ onCreated }: { onCreated: (customer: Customer) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const { mutateAsync, isPending } = useCreateCustomer();
  const qc = useQueryClient();

  function handleClose() {
    setOpen(false);
    setName('');
    setError('');
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Le nom est requis.'); return; }
    try {
      const customer = await mutateAsync({ name: name.trim() });
      // Inject immediately into cache so the select shows the name right away
      qc.setQueriesData({ queryKey: ['customers'] }, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const paged = old as { results: Customer[] };
        if (paged.results.some((c) => c.id === customer.id)) return paged;
        return { ...paged, results: [customer, ...paged.results] };
      });
      onCreated(customer);
      handleClose();
    } catch (err) {
      if (err instanceof ApiError && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, string[]>;
        setError(data.name?.[0] ?? 'Erreur lors de la création.');
      } else {
        setError('Erreur lors de la création.');
      }
    }
  }

  return (
    <>
      <AddButton onClick={() => setOpen(true)} />
      <Dialog.Root open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className={overlayClass} />
          <Dialog.Popup className={popupClass}>
            <DialogHeader title="Nouveau client" onClose={handleClose} />
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <FloatingInput
                  id="qc-name"
                  label="Nom du client *"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(''); }}
                  autoFocus
                />
                {error && <p className="text-[11px] text-destructive px-1">{error}</p>}
              </div>
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? 'Création…' : 'Créer le client'}
              </Button>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/* ─────────────────────────────────
   Quick add — Produit
───────────────────────────────── */
export function QuickAddProduct({ onCreated }: { onCreated: (product: ProductDetail) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const { mutateAsync, isPending } = useCreateProduct();
  const qc = useQueryClient();

  function handleClose() {
    setOpen(false);
    setName('');
    setPrice('');
    setErrors({});
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const errs: { name?: string; price?: string } = {};
    if (!name.trim()) errs.name = 'Le nom est requis.';
    if (!price || isNaN(parseFloat(price))) errs.price = 'Le prix de vente est requis.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      const product = await mutateAsync({
        name: name.trim(),
        selling_price: price,
        purchase_price: '',
        low_stock_threshold: null,
      });
      // Inject immediately into cache so the select shows the product right away
      qc.setQueriesData({ queryKey: ['products'] }, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const paged = old as { results: ProductDetail[] };
        if (paged.results.some((p) => p.id === product.id)) return paged;
        return { ...paged, results: [product, ...paged.results] };
      });
      onCreated(product);
      handleClose();
    } catch (err) {
      if (err instanceof ApiError && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, string[]>;
        setErrors({
          name: data.name?.[0],
          price: data.selling_price?.[0],
        });
      } else {
        setErrors({ name: 'Erreur lors de la création.' });
      }
    }
  }

  return (
    <>
      <AddButton onClick={() => setOpen(true)} />
      <Dialog.Root open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className={overlayClass} />
          <Dialog.Popup className={popupClass}>
            <DialogHeader title="Nouveau produit" onClose={handleClose} />
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <FloatingInput
                  id="qp-name"
                  label="Nom du produit *"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
                  autoFocus
                />
                {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name}</p>}
              </div>
              <div className="flex flex-col gap-0.5">
                <FloatingInput
                  id="qp-price"
                  label="Prix de vente *"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => { setPrice(e.target.value); setErrors((p) => ({ ...p, price: undefined })); }}
                />
                {errors.price && <p className="text-[11px] text-destructive px-1">{errors.price}</p>}
              </div>
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? 'Création…' : 'Créer le produit'}
              </Button>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
