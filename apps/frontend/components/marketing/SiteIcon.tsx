import type { JSX } from 'react';

type IconName =
  | 'box' | 'cart' | 'scale' | 'chat' | 'globe' | 'note' | 'hands' | 'scan'
  | 'check' | 'arrow' | 'shield';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  sw?: number;
};

export function SiteIcon({ name, size = 28, color = '#1a5544', sw = 1.8 }: Props) {
  const p = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const glyphs: Record<IconName, JSX.Element> = {
    box: <><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" {...p} /><path d="M4 7l8 4 8-4M12 11v10" {...p} /></>,
    cart: <><circle cx="9" cy="20" r="1.4" {...p} /><circle cx="18" cy="20" r="1.4" {...p} /><path d="M3 4h2l2.2 11h11l1.8-8H6" {...p} /></>,
    scale: <><path d="M12 3v17M5 20h14M7 6l-4 7h8L7 6ZM17 6l-4 7h8l-4-7Z" {...p} /><path d="M12 6 6 5M12 6l6-1" {...p} /></>,
    chat: <><path d="M4 5h16v11H9l-4 4V5Z" {...p} /><path d="M8 9h8M8 12h5" {...p} /></>,
    globe: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M3.5 12h17M12 3.5c2.5 2.3 2.5 14.7 0 17M12 3.5c-2.5 2.3-2.5 14.7 0 17" {...p} /></>,
    note: <><path d="M6 3h9l4 4v14H6V3Z" {...p} /><path d="M14 3v5h5M9 12h7M9 16h5" {...p} /></>,
    hands: <><path d="M3 13l4-4 4 3 3-3 6 5" {...p} /><path d="M3 13v4h18v-4M11 12l2 2" {...p} /></>,
    scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" {...p} /><path d="M4 12h16" {...p} /></>,
    check: <><path d="m5 12 4.5 4.5L19 7" {...p} /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" {...p} /></>,
    shield: <><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z" {...p} /><path d="m9 12 2 2 4-4" {...p} /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24">{glyphs[name]}</svg>;
}
