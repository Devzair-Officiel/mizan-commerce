'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch, setTokens } from '@/lib/api-client';

const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  full_name: z.string().min(2, 'Nom requis'),
  shop_name: z.string().min(2, 'Nom de boutique requis'),
  password: z.string().min(8, 'Minimum 8 caractères'),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(data: RegisterForm) {
    try {
      const res = await apiFetch<{ access: string; refresh: string }>('/auth/register/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setTokens(res.access, res.refresh);
      router.replace('/dashboard');
    } catch {
      setError('root', { message: 'Une erreur est survenue. Vérifiez vos informations.' });
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-100 px-4 py-8">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-zinc-900">Mizan</h1>
      <Card className="w-full shadow-md border border-zinc-200 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Créer un compte</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="full_name">Nom complet</Label>
              <Input id="full_name" autoComplete="name" {...register('full_name')} />
              {errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shop_name">Nom de la boutique</Label>
              <Input id="shop_name" {...register('shop_name')} />
              {errors.shop_name && <p className="text-xs text-red-500">{errors.shop_name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>
            {errors.root && <p className="text-sm text-red-500">{errors.root.message}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Création…' : 'Créer mon compte'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-zinc-500">
            Déjà un compte ?{' '}
            <Link href="/login" className="font-medium text-zinc-900 underline underline-offset-2">
              Se connecter
            </Link>
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
