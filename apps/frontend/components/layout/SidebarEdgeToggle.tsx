'use client';

import { useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Ctrl+B (⌘+B sur Mac), hors champ de saisie. */
function isToggleShortcut(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== 'b' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
  const target = event.target;
  return !(target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select')));
}

/**
 * Bouton replier / déplier à cheval sur le bord de la sidebar, à mi-hauteur : visible au survol de la sidebar
 * et au focus clavier (toujours au doigt). Le chevron pivote de 180°. Raccourci Ctrl+B, seulement quand la sidebar est affichée.
 */
export function SidebarEdgeToggle({ collapsed, onToggle, controls }: {
  collapsed: boolean;
  onToggle: () => void;
  /** id de la sidebar, pour aria-controls. */
  controls: string;
}) {
  const t = useTranslations('layout.sidebar');

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const sidebar = document.getElementById(controls);
      if (!isToggleShortcut(event) || !sidebar || sidebar.getClientRects().length === 0) return;
      event.preventDefault();
      onToggle();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [controls, onToggle]);

  return (
    <button type="button" onClick={onToggle} aria-label={collapsed ? t('expand') : t('collapse')}
      aria-expanded={!collapsed} aria-controls={controls} aria-keyshortcuts="Control+B"
      className="absolute top-1/2 -inset-e-3.5 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-card text-muted-foreground shadow-sm outline-none transition-[opacity,color] duration-150 ease-out before:absolute before:-inset-2 before:content-[''] hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring opacity-0 group-hover/sidebar:opacity-100 pointer-coarse:opacity-100">
      <ChevronLeft className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none rtl:-scale-x-100 ${collapsed ? 'rotate-180' : ''}`} />
    </button>
  );
}
