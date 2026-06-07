'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Palette } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { FloatingInput } from '@/components/ui/floating-fields';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import {
  type PublicPage,
  type PublicPageTheme,
  useUpdatePublicPage,
} from '@/lib/hooks/usePublicPageAdmin';
import { CoverUploader } from './CoverUploader';
import { LogoUploader } from './LogoUploader';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hexRegex = /^#[0-9A-Fa-f]{6}$/;

const schema = z.object({
  slug: z.string().min(3).max(50).regex(slugRegex, 'Lettres minuscules, chiffres et tirets uniquement'),
  display_name: z.string().max(120),
  tagline: z.string().max(160),
  description: z.string().max(2000),
  theme: z.enum(['classic', 'modern', 'minimal']),
  primary_color: z.string().regex(hexRegex, 'Format attendu : #RRGGBB'),
});

type FormValues = z.infer<typeof schema>;

const THEMES: { value: PublicPageTheme; label: string; hint: string }[] = [
  { value: 'classic', label: 'Classique', hint: 'Sobre, fond clair' },
  { value: 'modern', label: 'Moderne', hint: 'Contrastes affirmés' },
  { value: 'minimal', label: 'Minimal', hint: 'Beaucoup d\'espace' },
];

const COLOR_SWATCHES = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#16a34a', '#0891b2'];

function defaultsFromPage(page: PublicPage): FormValues {
  return {
    slug: page.slug,
    display_name: page.display_name,
    tagline: page.tagline,
    description: page.description,
    theme: page.theme,
    primary_color: page.primary_color,
  };
}

interface Props {
  page: PublicPage;
}

export function IdentityCard({ page }: Props) {
  const update = useUpdatePublicPage();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFromPage(page),
  });

  useEffect(() => {
    reset(defaultsFromPage(page));
  }, [page, reset]);

  const currentColor = watch('primary_color');
  const currentTheme = watch('theme');

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await update.mutateAsync(values);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { slug?: string[]; primary_color?: string[]; detail?: string } | null;
        setServerError(
          data?.slug?.[0]
          ?? data?.primary_color?.[0]
          ?? data?.detail
          ?? 'Mise à jour impossible',
        );
      } else {
        setServerError('Mise à jour impossible');
      }
    }
  }

  return (
    <SettingsCard
      icon={Palette}
      title="Identité de la page"
      description="Ce que vos clients voient en haut de la vitrine."
    >
      <LogoUploader page={page} />
      <CoverUploader page={page} />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <FloatingInput id="slug" label="Adresse URL *" {...register('slug')} />
          {errors.slug && <p className="text-[11px] text-destructive px-1">{errors.slug.message}</p>}
          <p className="text-[11px] text-muted-foreground px-1 mt-1">
            Modifier l&apos;adresse cassera les liens déjà partagés.
          </p>
        </div>

        <div className="flex flex-col gap-0.5">
          <FloatingInput id="display_name" label="Nom affiché" {...register('display_name')} />
          {errors.display_name && (
            <p className="text-[11px] text-destructive px-1">{errors.display_name.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-0.5">
          <FloatingInput
            id="tagline"
            label="Phrase d'accroche"
            placeholder=" "
            {...register('tagline')}
          />
          {errors.tagline && (
            <p className="text-[11px] text-destructive px-1">{errors.tagline.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-[11px] text-muted-foreground px-1">
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground transition-[border-color,box-shadow] duration-200 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            {...register('description')}
          />
          {errors.description && (
            <p className="text-[11px] text-destructive px-1">{errors.description.message}</p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[11px] text-muted-foreground px-1">Thème</legend>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <label
                key={t.value}
                className={`flex flex-col items-center gap-1 rounded-2xl border p-3 cursor-pointer text-center transition-colors ${
                  currentTheme === t.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                <input type="radio" value={t.value} {...register('theme')} className="sr-only" />
                <span className="text-xs font-semibold">{t.label}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{t.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[11px] text-muted-foreground px-1">Couleur principale</legend>
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Choisir ${c}`}
                onClick={() => setValue('primary_color', c, { shouldDirty: true })}
                className={`h-8 w-8 rounded-full border-2 transition-transform ${
                  currentColor.toLowerCase() === c.toLowerCase()
                    ? 'border-foreground scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="inline-flex items-center gap-2 ml-auto cursor-pointer">
              <input
                type="color"
                value={currentColor}
                onChange={(e) => setValue('primary_color', e.target.value, { shouldDirty: true })}
                className="h-8 w-8 cursor-pointer rounded-full border border-border"
              />
              <span className="text-xs font-mono text-muted-foreground">{currentColor}</span>
            </label>
          </div>
          {errors.primary_color && (
            <p className="text-[11px] text-destructive px-1">{errors.primary_color.message}</p>
          )}
        </fieldset>

        {serverError && (
          <p className="text-xs text-destructive text-center">{serverError}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {isDirty && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => reset(defaultsFromPage(page))}
            >
              Annuler
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!isDirty || update.isPending}>
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}
