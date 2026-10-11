'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProductImage } from '@/lib/hooks/useProducts';

/** Au plus 8 photos par article (`PRODUCT_IMAGE_MAX_COUNT` côté serveur). */
export const PRODUCT_PHOTO_MAX_COUNT = 8;

/**
 * Photo du formulaire. `id` : photo enregistrée (`null` pour une nouvelle). `file` : image carrée
 * à envoyer (nouvelle ou recadrée). `source` : image d'origine, recadrée à nouveau sans perte.
 */
export interface PhotoItem {
  key: string;
  id: string | null;
  url: string | null;
  file: File | null;
  source: File | null;
}

/** Ce qu'il reste à envoyer à l'enregistrement, dans l'ordre : retraits, recadrages, ajouts, principale. */
export interface PhotoChanges {
  removed: string[];
  replaced: { id: string; file: File }[];
  added: { key: string; file: File }[];
  /** Photo principale voulue : identifiant enregistré, ou clé d'une nouvelle photo. */
  primary: { id: string } | { key: string } | null;
}

interface PhotosState {
  items: PhotoItem[];
  primary: string | null;
  removed: string[];
}

function initialState(images: ProductImage[]): PhotosState {
  const items = [...images].sort((a, b) => a.position - b.position)
    .map((i) => ({ key: i.id, id: i.id, url: i.url, file: null, source: null }));
  return { items, primary: (images.find((i) => i.is_primary) ?? images[0])?.id ?? null, removed: [] };
}

/** Photos de l'article dans le formulaire : ajout, recadrage, retrait, choix de la principale. */
export function useProductPhotos(images: ProductImage[] = []) {
  const [initial] = useState(() => initialState(images));
  const [state, setState] = useState(initial);
  const counter = useRef(0);
  // Aperçus locaux (blob:) libérés au démontage du formulaire.
  const previews = useRef<string[]>([]);
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const preview = (file: File) => {
    const url = URL.createObjectURL(file);
    previews.current.push(url);
    return url;
  };

  const add = (file: File, source: File) => {
    const key = `new-${(counter.current += 1)}`;
    const url = preview(file);
    setState((s) => ({ ...s, items: [...s.items, { key, id: null, url, file, source }], primary: s.primary ?? key }));
  };

  const replace = (key: string, file: File, source: File) => {
    const url = preview(file);
    setState((s) => ({ ...s, items: s.items.map((i) => (i.key === key ? { ...i, url, file, source } : i)) }));
  };

  const remove = (key: string) => setState((s) => {
    const items = s.items.filter((i) => i.key !== key);
    const gone = s.items.find((i) => i.key === key)?.id;
    return { items, removed: gone ? [...s.removed, gone] : s.removed, primary: s.primary === key ? (items[0]?.key ?? null) : s.primary };
  });

  const setPrimary = (key: string) => setState((s) => ({ ...s, primary: key }));

  const main = state.items.find((i) => i.key === state.primary) ?? null;
  const dirty = state.removed.length > 0 || state.primary !== initial.primary || state.items.some((i) => i.file);
  const changes = (): PhotoChanges => ({
    removed: state.removed,
    replaced: state.items.flatMap((i) => (i.id && i.file ? [{ id: i.id, file: i.file }] : [])),
    added: state.items.flatMap((i) => (!i.id && i.file ? [{ key: i.key, file: i.file }] : [])),
    primary: main ? (main.id ? { id: main.id } : { key: main.key }) : null,
  });

  return { items: state.items, main, dirty, add, replace, remove, setPrimary, changes };
}

export type ProductPhotos = ReturnType<typeof useProductPhotos>;

/**
 * Fichier d'une photo enregistrée, pour la recadrer. Lu par le proxy (même origine) : une image
 * chargée depuis l'URL signée du stockage rendrait le canvas du recadrage inexploitable.
 */
export async function fetchPhotoFile(productId: string, imageId: string): Promise<File> {
  const res = await fetch(`/api/proxy/products/${productId}/images/${imageId}/file/`);
  if (!res.ok) throw new Error(`photo ${res.status}`);
  const blob = await res.blob();
  return new File([blob], 'photo', { type: blob.type });
}
