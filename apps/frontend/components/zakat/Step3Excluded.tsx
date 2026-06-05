'use client';

import { ShieldCheck, Check } from 'lucide-react';
import { EXCLUDED_ITEM_LABELS, type ExcludedItem } from '@/lib/hooks/useZakat';
import { ReligiousNote } from './ReligiousNote';

interface Step3Props {
  acknowledged: ExcludedItem[];
  onChange: (patch: { excludedItemsAcknowledged: ExcludedItem[] }) => void;
}

const ITEMS = Object.keys(EXCLUDED_ITEM_LABELS) as ExcludedItem[];

export function Step3Excluded({ acknowledged, onChange }: Step3Props) {
  const toggle = (item: ExcludedItem) => {
    const next = acknowledged.includes(item)
      ? acknowledged.filter((i) => i !== item)
      : [...acknowledged, item];
    onChange({ excludedItemsAcknowledged: next });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <ShieldCheck className="text-primary shrink-0 mt-0.5" size={18} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Ce qui n&apos;entre PAS dans la zakat</p>
          <p className="text-xs text-muted-foreground">
            Vos outils de travail ne sont pas concernés. Cochez ce que vous possédez pour confirmer
            que vous en avez pris connaissance — rien ne sera ajouté à votre base.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {ITEMS.map((item) => {
          const checked = acknowledged.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => toggle(item)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                checked
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <span
                className={`flex items-center justify-center w-5 h-5 rounded-md border-2 shrink-0 transition-colors ${
                  checked ? 'bg-primary border-primary' : 'border-border'
                }`}
              >
                {checked && <Check size={12} className="text-primary-foreground" strokeWidth={3} />}
              </span>
              <span className="text-sm text-foreground">{EXCLUDED_ITEM_LABELS[item]}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground px-1">
        Cette étape est informative. Cocher ou ne rien cocher ne change pas votre calcul.
      </p>

      <ReligiousNote rubric="excluded" />
    </div>
  );
}
