'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Globe } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { FloatingInput } from '@/components/ui/floating-fields';
import { Button } from '@/components/ui/button';
import { useCreatePublicPage } from '@/lib/hooks/usePublicPageAdmin';
import { ApiError } from '@/lib/api-client';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const schema = z.object({
  slug: z.string()
    .min(3, '3 caractères minimum')
    .max(50, '50 caractères maximum')
    .regex(slugRegex, 'Lettres minuscules, chiffres et tirets uniquement'),
  display_name: z.string().max(120).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  suggestedSlug: string;
  suggestedDisplayName: string;
}

export function CreatePageCard({ suggestedSlug, suggestedDisplayName }: Props) {
  const { mutateAsync, isPending } = useCreatePublicPage();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { slug: suggestedSlug, display_name: suggestedDisplayName },
  });

  useEffect(() => {
    reset({ slug: suggestedSlug, display_name: suggestedDisplayName });
  }, [suggestedSlug, suggestedDisplayName, reset]);

  const slug = watch('slug');

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await mutateAsync({ slug: values.slug, display_name: values.display_name || undefined });
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { slug?: string[]; detail?: string } | null;
        setServerError(data?.slug?.[0] ?? data?.detail ?? 'Création impossible');
      } else {
        setServerError('Création impossible');
      }
    }
  }

  return (
    <SettingsCard
      icon={Globe}
      title="Activer ma page publique"
      description="Une URL unique pour partager votre vitrine avec vos clients."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <FloatingInput
            id="slug"
            label="Adresse de la boutique *"
            {...register('slug')}
          />
          {errors.slug && (
            <p className="text-[11px] text-destructive px-1">{errors.slug.message}</p>
          )}
          <p className="text-[11px] text-muted-foreground px-1 mt-1 break-all">
            Votre URL : <span className="font-mono text-foreground">/boutique/{slug || '…'}</span>
          </p>
        </div>

        <div className="flex flex-col gap-0.5">
          <FloatingInput
            id="display_name"
            label="Nom affiché sur la page"
            {...register('display_name')}
          />
          {errors.display_name && (
            <p className="text-[11px] text-destructive px-1">{errors.display_name.message}</p>
          )}
        </div>

        {serverError && (
          <p className="text-xs text-destructive text-center">{serverError}</p>
        )}

        <Button type="submit" disabled={isPending} className="mt-1">
          {isPending ? 'Création…' : 'Créer ma page'}
        </Button>
      </form>
    </SettingsCard>
  );
}
