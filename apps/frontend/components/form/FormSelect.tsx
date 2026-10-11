'use client';

import type { Ref } from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type { FieldControlProps } from './FormField';
import { FIELD_CONTROL } from './fieldStyles';

interface FormSelectProps<V extends string> {
  /** Attributs du `FormField` (id, aide, erreur, obligatoire). */
  control: FieldControlProps;
  value: V;
  onChange: (value: V) => void;
  options: readonly { value: V; label: string }[];
  /** Ref du déclencheur : `setFocus` de React Hook Form y place le focus. */
  triggerRef?: Ref<HTMLButtonElement>;
}

/** Menu de choix (Base UI) au style des champs du gabarit : remplace le `<select>` natif. */
export function FormSelect<V extends string>({ control, value, onChange, options, triggerRef }: FormSelectProps<V>) {
  return (
    <Select.Root value={value} onValueChange={(v) => { if (v !== null) onChange(v); }} items={options}>
      <Select.Trigger ref={triggerRef} {...control} className={`${FIELD_CONTROL} flex items-center justify-between gap-2 pe-3 text-start`}>
        <Select.Value className="truncate" />
        <Select.Icon className="flex shrink-0 text-muted-foreground"><ChevronDown size={16} aria-hidden /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        {/* Au-dessus des fenêtres du bas (z-70), où le menu s'ouvre aussi. */}
        <Select.Positioner sideOffset={4} align="start" alignItemWithTrigger={false} className="z-90 w-(--anchor-width)">
          <Select.Popup className="max-h-(--available-height) overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg outline-none">
            {options.map((option) => (
              <Select.Item key={option.value} value={option.value}
                className="flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-sm text-foreground outline-none data-highlighted:bg-muted data-selected:font-semibold">
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="flex text-primary"><Check size={16} aria-hidden /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
