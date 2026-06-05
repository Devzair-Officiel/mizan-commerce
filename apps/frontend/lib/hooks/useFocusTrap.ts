import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;

    const node = ref.current;
    if (!node) return;
    const container: HTMLElement = node;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('aria-hidden') && el.offsetParent !== null,
      );

    const first = focusables()[0];
    if (first) {
      first.focus();
    } else {
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0]!;
      const lastEl = list[list.length - 1]!;
      const current = document.activeElement as HTMLElement | null;

      const outside = !current || !container.contains(current);
      if (e.shiftKey) {
        if (current === firstEl || outside) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (current === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }

    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
