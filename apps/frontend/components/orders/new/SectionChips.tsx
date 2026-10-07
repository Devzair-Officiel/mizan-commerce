interface SectionChipsProps {
  title: string;
  options: { value: string; label: string }[];
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
      <div className="rounded-full bg-muted p-1 flex">
        {options.map(({ value: v, label }) => {
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={active}
              className={`flex-1 rounded-full px-4 py-2 text-sm transition-all duration-200 ease-out active:scale-[0.98] ${
                active
                  ? 'bg-card text-foreground font-semibold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
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
