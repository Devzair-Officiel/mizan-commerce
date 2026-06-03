'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import { useMe, useUpdateMe, useChangePassword } from '@/lib/hooks/useMe';
import { ApiError } from '@/lib/api-client';

type PasswordFieldProps = Omit<ComponentProps<typeof FloatingInput>, 'type'>;

function PasswordField({ label, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <FloatingInput
        type={visible ? 'text' : 'password'}
        label={label}
        className="pr-12"
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        aria-pressed={visible}
        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

const profileSchema = z.object({
  full_name: z.string().min(1, 'Nom requis'),
  phone: z.string().optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z.object({
  old_password: z.string().min(1, 'Mot de passe actuel requis'),
  new_password: z.string().min(8, '8 caractères minimum'),
  confirm: z.string().min(1, 'Confirmation requise'),
}).refine((v) => v.new_password === v.confirm, {
  path: ['confirm'],
  message: 'Les mots de passe ne correspondent pas',
});

type PasswordValues = z.infer<typeof passwordSchema>;

function ProfileForm() {
  const { data: me, isLoading } = useMe();
  const { mutateAsync, isPending, isSuccess } = useUpdateMe();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
  });

  useEffect(() => {
    if (me) {
      reset({ full_name: me.full_name ?? '', phone: me.phone ?? '' });
    }
  }, [me, reset]);

  async function onSubmit(values: ProfileValues) {
    await mutateAsync(values);
    reset(values);
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <FloatingInput id="email" label="Email" value={me?.email ?? ''} disabled readOnly />
        <p className="text-[11px] text-muted-foreground px-1">L&apos;email ne peut pas être modifié.</p>
      </div>

      <div className="flex flex-col gap-0.5">
        <FloatingInput id="full_name" label="Nom complet *" {...register('full_name')} />
        {errors.full_name && <p className="text-[11px] text-destructive px-1">{errors.full_name.message}</p>}
      </div>

      <FloatingInput id="phone" label="Téléphone (optionnel)" {...register('phone')} />

      {isSuccess && !isDirty && (
        <p className="text-sm text-green-600 text-center">Profil mis à jour ✓</p>
      )}

      <Button type="submit" disabled={isPending || !isDirty} className="w-full mt-1">
        {isPending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const { mutateAsync, isPending } = useChangePassword();

  const {
    register, handleSubmit, reset, setError,
    formState: { errors, isSubmitSuccessful },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
  });

  async function onSubmit(values: PasswordValues) {
    try {
      await mutateAsync({
        old_password: values.old_password,
        new_password: values.new_password,
      });
      reset({ old_password: '', new_password: '', confirm: '' });
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const data = err.data as Record<string, unknown>;
        if (typeof data.old_password === 'string') {
          setError('old_password', { message: data.old_password });
          return;
        }
        if (Array.isArray(data.new_password) && typeof data.new_password[0] === 'string') {
          setError('new_password', { message: data.new_password[0] });
          return;
        }
      }
      setError('root', { message: 'Erreur inattendue. Réessayez.' });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <PasswordField id="old_password" label="Mot de passe actuel *" autoComplete="current-password" {...register('old_password')} />
        {errors.old_password && <p className="text-[11px] text-destructive px-1">{errors.old_password.message}</p>}
      </div>

      <div className="flex flex-col gap-0.5">
        <PasswordField id="new_password" label="Nouveau mot de passe *" autoComplete="new-password" {...register('new_password')} />
        {errors.new_password && <p className="text-[11px] text-destructive px-1">{errors.new_password.message}</p>}
      </div>

      <div className="flex flex-col gap-0.5">
        <PasswordField id="confirm" label="Confirmer le nouveau mot de passe *" autoComplete="new-password" {...register('confirm')} />
        {errors.confirm && <p className="text-[11px] text-destructive px-1">{errors.confirm.message}</p>}
      </div>

      {errors.root && <p className="text-[11px] text-destructive px-1">{errors.root.message}</p>}

      {isSubmitSuccessful && !errors.root && (
        <p className="text-sm text-green-600 text-center">Mot de passe modifié ✓</p>
      )}

      <Button type="submit" disabled={isPending} className="w-full mt-1">
        {isPending ? 'Modification…' : 'Modifier le mot de passe'}
      </Button>
    </form>
  );
}

export default function ProfilePage() {
  return (
    <>
      <TopBar title="Mon profil" />
      <div className="flex flex-col gap-8 px-4 pb-8 pt-4">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Informations</h2>
          <ProfileForm />
        </section>

        <div className="h-px bg-border" />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Mot de passe</h2>
          <PasswordForm />
        </section>
      </div>
    </>
  );
}
