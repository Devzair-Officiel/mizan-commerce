'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
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
import { resetKeepingEdits } from '@/components/form/resetKeepingEdits';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hexRegex = /^#[0-9A-Fa-f]{6}$/;

// Messages : clés sous `public_page_admin.slug` et `public_page_admin.identity`, traduites à l'affichage.
const schema = z.object({
  slug: z.string().min(3, 'min').max(50, 'max').regex(slugRegex, 'format'),
  display_name: z.string().max(120),
  tagline: z.string().max(160),
  description: z.string().max(2000),
  theme: z.enum(['classic', 'modern', 'minimal']),
  primary_color: z.string().regex(hexRegex, 'color_format'),
});

type FormValues = z.infer<typeof schema>;

// Libellés sous `public_page_admin.identity.themes.<thème>.{label,hint}`.
const THEMES: PublicPageTheme[] = ['classic', 'modern', 'minimal'];

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
  const t = useTranslations('public_page_admin');
  const update = useUpdatePublicPage();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFromPage(page),
  });
  const { register, handleSubmit, reset, setValue, control, formState: { errors, isDirty } } = form;

  // Page rechargée (après un enregistrement notamment) : la saisie en cours est gardée.
  useEffect(() => {
    resetKeepingEdits(form, defaultsFromPage(page));
  }, [page, form]);

  const currentColor = useWatch({ control, name: 'primary_color' });
  const currentTheme = useWatch({ control, name: 'theme' });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const saved = await update.mutateAsync(values);
      resetKeepingEdits(form, defaultsFromPage(saved), values);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { slug?: string[]; primary_color?: string[]; detail?: string } | null;
        setServerError(
          data?.slug?.[0]
          ?? data?.primary_color?.[0]
          ?? data?.detail
          ?? t('identity.error'),
        );
      } else {
        setServerError(t('identity.error'));
      }
    }
  }

  return (
    <SettingsCard
      icon={Palette}
      title={t('identity.title')}
      description={t('identity.description')}
    >
      <LogoUploader page={page} />
      <CoverUploader page={page} />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <FloatingInput id="slug" label={t('identity.slug_label')} {...register('slug')} />
          {errors.slug && <p className="text-[11px] text-destructive px-1">{t(`slug.${errors.slug.message}`)}</p>}
          <p className="text-[11px] text-muted-foreground px-1 mt-1">
            {t('identity.slug_help')}
          </p>
        </div>

        <div className="flex flex-col gap-0.5">
          <FloatingInput id="display_name" label={t('identity.display_name_label')} {...register('display_name')} />
          {errors.display_name && (
            <p className="text-[11px] text-destructive px-1">{errors.display_name.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-0.5">
          <FloatingInput
            id="tagline"
            label={t('identity.tagline_label')}
            placeholder=" "
            {...register('tagline')}
          />
          {errors.tagline && (
            <p className="text-[11px] text-destructive px-1">{errors.tagline.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-[11px] text-muted-foreground px-1">
            {t('identity.description_label')}
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
          <legend className="text-[11px] text-muted-foreground px-1">{t('identity.theme_label')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((theme) => (
              <label
                key={theme}
                className={`flex flex-col items-center gap-1 rounded-2xl border p-3 cursor-pointer text-center transition-colors ${
                  currentTheme === theme
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                <input type="radio" value={theme} {...register('theme')} className="sr-only" />
                <span className="text-xs font-semibold">{t(`identity.themes.${theme}.label`)}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{t(`identity.themes.${theme}.hint`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[11px] text-muted-foreground px-1">{t('identity.color_label')}</legend>
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t('identity.choose_color', { color: c })}
                onClick={() => setValue('primary_color', c, { shouldDirty: true })}
                className={`h-8 w-8 rounded-full border-2 transition-transform ${
                  currentColor.toLowerCase() === c.toLowerCase()
                    ? 'border-foreground scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="inline-flex items-center gap-2 ms-auto cursor-pointer">
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
            <p className="text-[11px] text-destructive px-1">{t(`identity.${errors.primary_color.message}`)}</p>
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
              {t('identity.cancel')}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!isDirty || update.isPending}>
            {update.isPending ? t('identity.saving') : t('identity.save')}
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}
