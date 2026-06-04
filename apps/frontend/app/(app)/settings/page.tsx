'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import { ImageCropDialog } from '@/components/ui/ImageCropDialog';
import { useShop, useUpdateShop, useUploadShopLogo, useDeleteShopLogo } from '@/lib/hooks/useShop';

const CURRENCIES = ['EUR', 'MAD', 'TND', 'DZD', 'XOF', 'USD', 'GBP'];
const COUNTRIES = [
  { code: 'FR', label: 'France' },
  { code: 'MA', label: 'Maroc' },
  { code: 'TN', label: 'Tunisie' },
  { code: 'DZ', label: 'Algérie' },
  { code: 'SN', label: 'Sénégal' },
  { code: 'CI', label: "Côte d'Ivoire" },
  { code: 'BE', label: 'Belgique' },
  { code: 'GB', label: 'Royaume-Uni' },
];

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  currency: z.string().min(1),
  country: z.string().optional(),
  zakat_annual_date: z.string().optional(),
  nisab_method: z.enum(['gold', 'silver']),
  nisab_unit_price: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function SettingsPage() {
  const { data: shop, isLoading } = useShop();
  const { mutateAsync, isPending, isSuccess } = useUpdateShop();
  const uploadLogo = useUploadShopLogo();
  const deleteLogo = useDeleteShopLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  function handlePickFile() {
    setLogoError(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setLogoError('Formats acceptés : JPEG, PNG, WebP.');
      return;
    }
    setPendingFile(file);
  }

  async function handleCropConfirm(blob: Blob) {
    try {
      await uploadLogo.mutateAsync(blob);
      setPendingFile(null);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Erreur upload');
    }
  }

  async function handleDeleteLogo() {
    if (!confirm('Supprimer le logo de la boutique ?')) return;
    try {
      await deleteLogo.mutateAsync();
    } catch {
      setLogoError('Erreur lors de la suppression.');
    }
  }

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (shop) {
      reset({
        name: shop.name,
        currency: shop.currency,
        country: shop.country ?? '',
        zakat_annual_date: shop.zakat_annual_date ?? '',
        nisab_method: shop.nisab_method ?? 'silver',
        nisab_unit_price: shop.nisab_unit_price ?? '',
      });
    }
  }, [shop, reset]);

  async function onSubmit(values: FormValues) {
    await mutateAsync({
      ...values,
      zakat_annual_date: values.zakat_annual_date || null,
      nisab_unit_price: values.nisab_unit_price && parseFloat(values.nisab_unit_price) > 0
        ? values.nisab_unit_price
        : null,
    });
    reset(values);
  }

  if (isLoading) return <><TopBar title="Paramètres" /><p className="p-4 text-sm text-muted-foreground">Chargement…</p></>;

  return (
    <>
      <TopBar title="Paramètres boutique" />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 px-4 pt-4 pb-32">

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identité</h2>

          <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted flex items-center justify-center">
              {shop?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shop.logo_url} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-muted-foreground">
                  {(shop?.name ?? '?').trim().charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePickFile}
                disabled={uploadLogo.isPending}
              >
                {uploadLogo.isPending ? 'Envoi…' : shop?.logo_url ? 'Changer le logo' : 'Ajouter un logo'}
              </Button>
              {shop?.logo_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleDeleteLogo}
                  disabled={deleteLogo.isPending}
                >
                  {deleteLogo.isPending ? 'Suppression…' : 'Supprimer'}
                </Button>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          {logoError && <p className="text-[11px] text-destructive px-1">{logoError}</p>}

          <div className="flex flex-col gap-0.5">
            <FloatingInput id="name" label="Nom de la boutique *" {...register('name')} />
            {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name.message}</p>}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Régional</h2>
          <div className="grid grid-cols-2 gap-3">
            <FloatingSelect id="currency" label="Devise" {...register('currency')}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </FloatingSelect>
            <FloatingSelect id="country" label="Pays (optionnel)" {...register('country')}>
              <option value="">—</option>
              {COUNTRIES.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
            </FloatingSelect>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zakat</h2>
          <div className="flex flex-col gap-0.5">
            <FloatingInput id="zakat_annual_date" label="Date annuelle (optionnel)" type="date" {...register('zakat_annual_date')} />
            <p className="text-[11px] text-muted-foreground px-1">Un rappel sera généré avant cette date chaque année.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-2">
            <FloatingSelect id="nisab_method" label="Méthode du Nisab" {...register('nisab_method')}>
              <option value="silver">Argent (595 g)</option>
              <option value="gold">Or (85 g)</option>
            </FloatingSelect>
            <FloatingInput
              id="nisab_unit_price"
              label={`Prix au gramme (${shop?.currency ?? 'EUR'})`}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              {...register('nisab_unit_price')}
            />
          </div>
          <p className="text-[11px] text-muted-foreground px-1">
            Le cours évolue chaque jour. Vérifiez et mettez à jour le prix au gramme avant chaque
            calcul. La méthode de l'argent est plus inclusive (seuil plus bas).
          </p>
        </section>

        {isSuccess && !isDirty && (
          <p className="text-sm text-green-600 text-center">Modifications enregistrées ✓</p>
        )}

        {/* Barre d'actions sticky — apparaît quand le formulaire est modifié */}
        <div
          aria-hidden={!isDirty}
          className={`fixed left-0 right-0 z-40 px-4 pb-safe pointer-events-none transition-[transform,opacity] duration-200 bottom-16 lg:bottom-4 lg:left-60 ${
            isDirty ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          <div className={`mx-auto max-w-xl flex items-center gap-2 rounded-2xl border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-lg ${isDirty ? 'pointer-events-auto' : ''}`}>
            <p className="flex-1 text-xs font-medium text-muted-foreground px-1">
              Modifications non enregistrées
            </p>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => shop && reset({
                name: shop.name,
                currency: shop.currency,
                country: shop.country ?? '',
                zakat_annual_date: shop.zakat_annual_date ?? '',
                nisab_method: shop.nisab_method ?? 'silver',
                nisab_unit_price: shop.nisab_unit_price ?? '',
              })}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </form>

      <ImageCropDialog
        open={!!pendingFile}
        file={pendingFile}
        onClose={() => setPendingFile(null)}
        onConfirm={handleCropConfirm}
      />
    </>
  );
}
