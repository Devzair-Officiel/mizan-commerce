'use client';

import { useTranslations } from 'next-intl';

interface StatusSwitchProps {
  value: 'to_prepare' | 'shipped';
  onChange: (v: 'to_prepare' | 'shipped') => void;
  fm: string | null;
  catalogKind: string;
}

function SwitchTrack({ checked }: { checked: boolean }) {
  return (
    <span
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-input'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </span>
  );
}

export function StatusSwitch({ value, onChange, fm, catalogKind }: StatusSwitchProps) {
  const t = useTranslations('orders.new');

  if (fm === 'delivery') return null;

  if (fm === 'on_site') {
    const checked = value === 'to_prepare';
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(checked ? 'shipped' : 'to_prepare')}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"
        >
          <span>{t('switch_on_site')}</span>
          <SwitchTrack checked={checked} />
        </button>
        {!checked && (
          <p className="text-[0.8125rem] text-muted-foreground px-1">{t('switch_on_site_hint')}</p>
        )}
      </div>
    );
  }

  const checked = value === 'shipped';
  const switchLabel = catalogKind === 'services' ? t('switch_services') : t('switch_both');

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(checked ? 'to_prepare' : 'shipped')}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"
    >
      <span>{switchLabel}</span>
      <SwitchTrack checked={checked} />
    </button>
  );
}
