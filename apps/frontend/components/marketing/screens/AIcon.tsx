import { A } from './_theme';
import type { JSX } from 'react';

type IconName =
  | 'menu' | 'search' | 'refresh' | 'home' | 'users' | 'cart' | 'box' | 'plus'
  | 'link' | 'arrow' | 'trend' | 'receipt' | 'ticket' | 'clock' | 'alert'
  | 'docplus' | 'check' | 'scale' | 'info' | 'chevron' | 'bell';

type Props = { name: IconName; size?: number; color?: string; sw?: number };

export function AIcon({ name, size = 26, color = A.ink, sw = 1.9 }: Props) {
  const p = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const glyphs: Record<IconName, JSX.Element> = {
    menu: <><path d="M4 7h16M4 12h16M4 17h16" {...p} /></>,
    search: <><circle cx="11" cy="11" r="6.4" {...p} /><path d="m20 20-4-4" {...p} /></>,
    refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v3.5h-3.5" {...p} /></>,
    home: <><path d="M4 10.5 12 4l8 6.5M6 9.5V20h12V9.5" {...p} /></>,
    users: <><circle cx="9" cy="8" r="3" {...p} /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 6.5a3 3 0 0 1 0 5.5M16.5 14c2.4.3 4 2.2 4 5" {...p} /></>,
    cart: <><circle cx="9" cy="20" r="1.5" {...p} /><circle cx="18" cy="20" r="1.5" {...p} /><path d="M3 4h2l2.2 11h11l1.8-8H6" {...p} /></>,
    box: <><path d="M12 3 4 7v10l8 4 8-4V7l-8-4ZM4 7l8 4 8-4M12 11v10" {...p} /></>,
    plus: <><path d="M12 5v14M5 12h14" {...p} /></>,
    link: <><path d="M9 13a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-5.7-5.7L10 7" {...p} /><path d="M15 11a4 4 0 0 0-6-.5l-2 2A4 4 0 0 0 12.7 18L14 17" {...p} /></>,
    arrow: <><path d="M9 6l6 6-6 6" {...p} /></>,
    trend: <><path d="M4 16l5-5 4 3 6-7M14 7h5v5" {...p} /></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" {...p} /><path d="M9 8h6M9 12h6" {...p} /></>,
    ticket: <><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7Z" {...p} /><path d="M14 7v10" strokeDasharray="2 3" {...p} /></>,
    clock: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M12 7.5V12l3 2" {...p} /></>,
    alert: <><path d="M9 3h6l5 5v6l-5 5H9l-5-5V8l5-5Z" {...p} /><path d="M12 8v5M12 16.5v.01" {...p} /></>,
    docplus: <><path d="M6 3h8l4 4v14H6V3Z" {...p} /><path d="M14 3v4h4M12 11v6M9 14h6" {...p} /></>,
    check: <><path d="m5 12 4.5 4.5L19 7" {...p} /></>,
    scale: <><path d="M12 3v17M5 20h14M7 6l-4 7h8L7 6ZM17 6l-4 7h8l-4-7ZM12 6 6 5M12 6l6-1" {...p} /></>,
    info: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M12 11v5M12 7.5v.01" {...p} /></>,
    chevron: <><path d="M7 10l5 5 5-5" {...p} /></>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7ZM10 20a2 2 0 0 0 4 0" {...p} /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24">{glyphs[name]}</svg>;
}
