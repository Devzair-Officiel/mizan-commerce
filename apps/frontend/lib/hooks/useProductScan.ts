/**
 * Scan d'emballage (URS-109) : une photo de face, et celle du dos si besoin ; des propositions par
 * champ, rien n'est enregistré.
 *
 * Endpoint : POST /api/ocr/product-scan (route handler dédié, multipart `image` et `image_back`) → Django
 * `POST /ocr/product-scan/`. Le cookie HttpOnly d'auth est lu côté serveur ; le token n'est
 * jamais exposé au client.
 */
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

const SCAN_SOURCES = ['barcode', 'open_food_facts', 'ocr', 'vision'] as const;

const scanField = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.enum(SCAN_SOURCES),
}).nullable();

const productScanSchema = z.object({
  fields: z.object({
    /** Nom composé par le serveur : [marque] désignation [variante] [contenance]. */
    name: scanField,
    brand: scanField,
    product_name: scanField,
    variant: scanField,
    net_quantity: scanField,
    unit_suggestion: scanField,
    barcode: scanField,
    /** Allégations lues sur l'emballage, jamais la désignation. */
    description: scanField,
  }),
  warnings: z.array(z.string()),
});

export type ProductScan = z.infer<typeof productScanSchema>;

/** Photos d'un scan : la face, et le dos pour compléter (code-barres, contenance). */
export interface ScanPhotos {
  face: File;
  back?: File;
}

/** Ce qu'a donné un scan : champs lus sur la photo, et ceux qui ont été remplis (encore vides). */
export interface ScanOutcome {
  found: number;
  filled: number;
}

/** Avertissements connus (le reste est ignoré à l'affichage). */
export const SCAN_WARNINGS = ['text_quota_reached', 'vision_quota_reached', 'vision_unavailable'] as const;
export type ScanWarning = (typeof SCAN_WARNINGS)[number];

export const isScanWarning = (code: string): code is ScanWarning => SCAN_WARNINGS.some((w) => w === code);

/** Formats et taille acceptés (le serveur reste seul juge : il vérifie aussi le contenu). */
export const SCAN_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const SCAN_MAX_MB = 8;

/** Refus de la photo (code de la réponse 400) ou indisponibilité, traduits à l'écran. */
const SCAN_REFUSALS = ['type', 'too_large', 'signature', 'empty', 'image_too_large', 'image_unreadable'] as const;
export type ProductScanFailure = (typeof SCAN_REFUSALS)[number] | 'throttled' | 'unavailable' | 'session';

export class ProductScanError extends Error {
  constructor(public reason: ProductScanFailure) {
    super(`Product scan failed: ${reason}`);
  }
}

/** Problème de la photo avant l'envoi, `null` si elle est acceptable. */
export function scanFileProblem(file: File): ProductScanFailure | null {
  if (!SCAN_TYPES.includes(file.type)) return 'type';
  if (file.size > SCAN_MAX_MB * 1024 * 1024) return 'too_large';
  return file.size === 0 ? 'empty' : null;
}

function failureOf(status: number, data: unknown): ProductScanFailure {
  const code = typeof data === 'object' && data !== null ? (data as { code?: unknown }).code : undefined;
  if (status === 400) return SCAN_REFUSALS.find((r) => r === code) ?? 'type';
  return status === 429 ? 'throttled' : 'unavailable';
}

async function scanProduct({ face, back }: ScanPhotos): Promise<ProductScan> {
  const formData = new FormData();
  formData.append('image', face);
  if (back) formData.append('image_back', back);
  let res: Response;
  try {
    res = await fetch('/api/ocr/product-scan', { method: 'POST', body: formData });
  } catch {
    throw new ProductScanError('unavailable');
  }
  // Le route handler a déjà tenté le rafraîchissement : session vraiment expirée.
  if (res.status === 401) throw new ProductScanError('session');
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ProductScanError(failureOf(res.status, data));
  const parsed = productScanSchema.safeParse(data);
  if (!parsed.success) throw new ProductScanError('unavailable');
  return parsed.data;
}

/** Envoi des photos d'emballage ; l'appelant applique les propositions au formulaire. */
export function useProductScan() {
  const router = useRouter();
  return useMutation<ProductScan, ProductScanError, ScanPhotos>({
    mutationFn: async (photos) => {
      const problem = scanFileProblem(photos.face) ?? (photos.back ? scanFileProblem(photos.back) : null);
      if (problem) throw new ProductScanError(problem);
      return scanProduct(photos);
    },
    retry: false,
    onError: (error) => { if (error.reason === 'session') router.push('/login'); },
  });
}
