interface SectionChipsProps {
  title: string;
  options: { value: string; label: string; activeClass?: string }[];
  value: string;
  onChange: (v: string) => void;
  children?: React.ReactNode;
}

export function SectionChips({
  title, options, value, onChange, children,
}: SectionChipsProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
        {title}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map(({ value: v, label, activeClass }) => {
          const active = value === v;
          const activeStyle = activeClass ?? 'bg-primary text-primary-foreground';
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={active}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                active
                  ? activeStyle
                  : 'bg-muted text-muted-foreground active:bg-muted/70'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}
