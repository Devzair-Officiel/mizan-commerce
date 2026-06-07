import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export type PublicPageTheme = 'classic' | 'modern' | 'minimal';
export type PublicSectionType = 'header' | 'description' | 'products' | 'services' | 'contact';
export type PublicContactType = 'whatsapp' | 'telegram' | 'instagram' | 'phone';

export interface PublicPageSection {
  id: string;
  type: PublicSectionType;
  position: number;
  is_visible: boolean;
  title: string;
  content: string;
  updated_at: string;
}

export interface PublicCatalogItem {
  id: string;
  product: string;
  product_id: string;
  product_name: string;
  product_type: 'product' | 'service';
  position: number;
  show_price: boolean;
  badge_promo: boolean;
  badge_new: boolean;
}

export interface PublicContactButton {
  id: string;
  type: PublicContactType;
  value: string;
  label: string;
  is_primary: boolean;
  is_visible: boolean;
  position: number;
}

export interface PublicPage {
  id: string;
  slug: string;
  is_active: boolean;
  is_published: boolean;
  is_live: boolean;
  display_name: string;
  tagline: string;
  description: string;
  logo_object_key: string;
  logo_url: string | null;
  cover_object_key: string;
  cover_url: string | null;
  theme: PublicPageTheme;
  primary_color: string;
  order_message_template: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  sections: PublicPageSection[];
  catalog_items: PublicCatalogItem[];
  contact_buttons: PublicContactButton[];
}

export type PublicPageResponse =
  | { exists: true; page: PublicPage }
  | { exists: false; suggested_slug: string; suggested_display_name: string };

export function usePublicPage() {
  return useQuery({
    queryKey: qk.publicPage.all,
    queryFn: () => apiFetch<PublicPageResponse>('/public-page/'),
  });
}

export function useCreatePublicPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { slug: string; display_name?: string }) =>
      apiFetch<PublicPage>('/public-page/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export interface PublicPageUpdate {
  slug?: string;
  is_active?: boolean;
  display_name?: string;
  tagline?: string;
  description?: string;
  theme?: PublicPageTheme;
  primary_color?: string;
  order_message_template?: string;
}

export function useUpdatePublicPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PublicPageUpdate) =>
      apiFetch<PublicPage>('/public-page/', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export function usePublishPublicPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<PublicPage>('/public-page/publish/', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export function useUnpublishPublicPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<PublicPage>('/public-page/unpublish/', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

// ── Logo / Cover ──────────────────────────────────────────────────────

async function uploadPageImage(field: 'logo' | 'cover', blob: Blob): Promise<PublicPage> {
  const formData = new FormData();
  formData.append(field, blob, `${field}.jpg`);
  const res = await fetch(`/api/proxy/public-page/${field}/`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Erreur upload');
  }
  return res.json() as Promise<PublicPage>;
}

export function useUploadPageLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blob: Blob) => uploadPageImage('logo', blob),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export function useDeletePageLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<PublicPage>('/public-page/logo/', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export function useUploadPageCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blob: Blob) => uploadPageImage('cover', blob),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export function useDeletePageCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<PublicPage>('/public-page/cover/', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

// ── Sections ──────────────────────────────────────────────────────────

export interface SectionUpdate {
  is_visible?: boolean;
  title?: string;
  content?: string;
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SectionUpdate }) =>
      apiFetch<PublicPageSection>(`/public-page/sections/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export function useReorderSections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: { id: string; position: number }[]) =>
      apiFetch<void>('/public-page/sections/reorder/', {
        method: 'POST',
        body: JSON.stringify({ order }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

// ── Catalogue ─────────────────────────────────────────────────────────

export interface CatalogCreate {
  product: string;
  position?: number;
  show_price?: boolean;
  badge_promo?: boolean;
  badge_new?: boolean;
}

export interface CatalogUpdate {
  position?: number;
  show_price?: boolean;
  badge_promo?: boolean;
  badge_new?: boolean;
}

export function useAddCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CatalogCreate) =>
      apiFetch<PublicCatalogItem>('/public-page/catalog/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export function useUpdateCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CatalogUpdate }) =>
      apiFetch<PublicCatalogItem>(`/public-page/catalog/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export function useRemoveCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/public-page/catalog/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export function useReorderCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: { id: string; position: number }[]) =>
      apiFetch<void>('/public-page/catalog/reorder/', {
        method: 'POST',
        body: JSON.stringify({ order }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

// ── Contacts ──────────────────────────────────────────────────────────

export interface ContactCreate {
  type: PublicContactType;
  value: string;
  label?: string;
  is_primary?: boolean;
  is_visible?: boolean;
  position?: number;
}

export interface ContactUpdate {
  value?: string;
  label?: string;
  is_primary?: boolean;
  is_visible?: boolean;
  position?: number;
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ContactCreate) =>
      apiFetch<PublicContactButton>('/public-page/contacts/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ContactUpdate }) =>
      apiFetch<PublicContactButton>(`/public-page/contacts/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/public-page/contacts/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.publicPage.all }),
  });
}