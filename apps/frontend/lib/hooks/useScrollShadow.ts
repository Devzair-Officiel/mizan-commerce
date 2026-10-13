import { useCallback, useState } from 'react';

/**
 * Zone défilante : indique s'il reste du contenu sous le bas visible (pour une ombre).
 * À poser en ref sur l'élément qui défile ; son premier enfant est observé pour suivre
 * les changements de contenu (recherche, filtre, variantes dépliées).
 */
export function useScrollShadow() {
  const [hasMore, setHasMore] = useState(false);

  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const update = () => setHasMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  return { ref, hasMore };
}
