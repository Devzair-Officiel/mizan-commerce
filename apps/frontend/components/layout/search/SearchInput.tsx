'use client';

import { useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  listId: string;
  activeId: string | null;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  showCancel?: boolean;
}

export function SearchInput({
  value, onChange, onClose, listId, activeId, onKeyDown,
  autoFocus, className, inputClassName, showCancel,
}: SearchInputProps) {
  const t = useTranslations('layout.search');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      const id = requestAnimationFrame(() => ref.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [autoFocus]);

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={ref}
        type="search"
        role="combobox"
        aria-expanded={true}
        aria-controls={listId}
        aria-activedescendant={activeId ?? undefined}
        aria-label={t('aria_label')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('placeholder')}
        className={`flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none ${inputClassName ?? ''}`}
        autoComplete="off"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label={t('clear')}
          className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <X size={13} aria-hidden />
        </button>
      )}
      {showCancel && (
        <button type="button" onClick={onClose}
          className="shrink-0 text-sm font-medium text-primary">
          {t('cancel')}
        </button>
      )}
    </div>
  );
}
