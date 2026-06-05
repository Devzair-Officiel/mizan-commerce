import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';

export type FreeLine = {
  product_name: string;
  unit_price: string;
  quantity: number;
};

interface FreeLineViewProps {
  onCancel: () => void;
  onSubmit: (line: FreeLine) => void;
}

type FieldErrors = { name?: string; price?: string; quantity?: string };

export function FreeLineView({ onCancel, onSubmit }: FreeLineViewProps) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const next: FieldErrors = {};
    if (!name.trim()) next.name = 'Le nom est requis.';
    const priceNum = parseFloat(price);
    if (!price || isNaN(priceNum) || priceNum < 0) next.price = 'Le prix est requis.';
    const qtyNum = parseInt(quantity, 10);
    if (!qtyNum || qtyNum < 1) next.quantity = 'La quantité doit être au moins 1.';
    if (Object.keys(next).length) { setErrors(next); return; }
    onSubmit({ product_name: name.trim(), unit_price: priceNum.toFixed(2), quantity: qtyNum });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        <span>Retour au catalogue</span>
      </button>

      <div className="flex flex-col gap-0.5">
        <FloatingInput
          id="fl-name"
          label="Description *"
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
          autoFocus
        />
        {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name}</p>}
      </div>

      <div className="flex gap-3">
        <div className="flex-1 flex flex-col gap-0.5">
          <FloatingInput
            id="fl-price"
            label="Prix unitaire *"
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => { setPrice(e.target.value); setErrors((p) => ({ ...p, price: undefined })); }}
          />
          {errors.price && <p className="text-[11px] text-destructive px-1">{errors.price}</p>}
        </div>
        <div className="w-24 flex flex-col gap-0.5">
          <FloatingInput
            id="fl-qty"
            label="Qté"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => { setQuantity(e.target.value); setErrors((p) => ({ ...p, quantity: undefined })); }}
          />
        </div>
      </div>
      {errors.quantity && <p className="text-[11px] text-destructive px-1 -mt-2">{errors.quantity}</p>}

      <Button type="submit" className="w-full">Ajouter à la commande</Button>
    </form>
  );
}
