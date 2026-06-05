import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title, icon, open, onToggle, children,
}: CollapsibleSectionProps) {
  return (
    <section className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center justify-between px-1 py-1 active:scale-[0.99] transition-transform"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="text-muted-foreground/70">{icon}</span>
          {title}
        </span>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="flex flex-col gap-3">{children}</div>}
    </section>
  );
}
