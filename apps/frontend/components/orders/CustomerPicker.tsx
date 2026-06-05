'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, Search, X, UserPlus, Phone, MapPin, User } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCustomers, type Customer } from '@/lib/hooks/useCustomers';

interface CustomerPickerProps {
  value: string;
  selectedCustomer?: Customer | null;
  onChange: (id: string) => void;
  onRequestCreate: () => void;
}

export function CustomerPicker({
  value,
  selectedCustomer,
  onChange,
  onRequestCreate,
}: CustomerPickerProps) {
  const t = useTranslations('orders.customerPicker');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data } = useCustomers(search);

  const customers = data?.results ?? [];

  function close() {
    setOpen(false);
    setSearch('');
  }

  function handleSelect(id: string) {
    onChange(id);
    close();
  }

  function handleCreate() {
    close();
    onRequestCreate();
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
  }

  const initial = selectedCustomer
    ? (selectedCustomer.first_name?.[0] ?? selectedCustomer.name?.[0] ?? '?').toUpperCase()
    : '';
  const fullName = selectedCustomer
    ? (selectedCustomer.first_name
        ? `${selectedCustomer.first_name} ${selectedCustomer.name}`
        : selectedCustomer.name)
    : '';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="w-full text-left rounded-2xl border border-border bg-card p-3 flex items-center gap-3 transition-colors active:bg-muted"
      >
        {value && selectedCustomer ? (
          <>
            <div className="shrink-0 w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-base">
              {initial}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground truncate">{fullName}</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
                {selectedCustomer.phone && (
                  <span className="flex items-center gap-1 min-w-0">
                    <Phone size={11} className="shrink-0" />
                    <span className="truncate tabular-nums">{selectedCustomer.phone}</span>
                  </span>
                )}
                {selectedCustomer.city && (
                  <span className="flex items-center gap-1 min-w-0">
                    <MapPin size={11} className="shrink-0" />
                    <span className="truncate">{selectedCustomer.city}</span>
                  </span>
                )}
                {!selectedCustomer.phone && !selectedCustomer.city && (
                  <span className="flex items-center gap-1">
                    <User size={11} className="shrink-0" />
                    <span>{t('trigger_selected')}</span>
                  </span>
                )}
              </div>
            </div>
            <span
              role="button"
              tabIndex={0}
              onClick={handleRemove}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRemove(e as unknown as React.MouseEvent); } }}
              aria-label={t('remove_aria')}
              className="shrink-0 w-9 h-9 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors flex items-center justify-center"
            >
              <X size={16} />
            </span>
          </>
        ) : (
          <>
            <div className="shrink-0 w-11 h-11 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
              <User size={18} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{t('trigger_select')}</span>
              <span className="text-xs text-muted-foreground">{t('trigger_select_sub')}</span>
            </div>
            <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
          </>
        )}
      </button>

      <BottomSheet open={open} onClose={close} title={t('sheet_title')}>
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            name="customer-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_placeholder')}
            className="w-full rounded-xl border border-border bg-muted py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t('search_clear_aria')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 mb-3">
          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-3 text-sm font-medium text-primary transition-colors active:bg-primary/10"
          >
            <span className="shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <UserPlus size={16} />
            </span>
            <span>{t('create_cta')}</span>
          </button>
        </div>

        <div className="flex flex-col divide-y divide-border -mx-5 px-5">
          {customers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {search ? t('no_results') : t('no_customers')}
            </p>
          ) : (
            customers.map((c) => {
              const itemInitial = (c.name?.[0] ?? '?').toUpperCase();
              const active = c.id === value;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c.id)}
                  className={`flex items-center gap-3 px-1 py-3 text-left transition-colors active:bg-muted ${
                    active ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm ${
                    active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {itemInitial}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className={`text-sm truncate ${active ? 'font-semibold' : 'font-medium'}`}>{c.name}</span>
                    {(c.phone || c.city) && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
                        {c.phone && (
                          <span className="flex items-center gap-1 min-w-0">
                            <Phone size={11} className="shrink-0" />
                            <span className="truncate tabular-nums">{c.phone}</span>
                          </span>
                        )}
                        {c.city && (
                          <span className="flex items-center gap-1 min-w-0">
                            <MapPin size={11} className="shrink-0" />
                            <span className="truncate">{c.city}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {active && <span className="shrink-0 h-2 w-2 rounded-full bg-primary" />}
                </button>
              );
            })
          )}
        </div>
      </BottomSheet>
    </>
  );
}
