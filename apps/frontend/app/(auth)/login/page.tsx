'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api-client';

type LoginForm = { email: string; password: string };

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const tc = useTranslations('auth.common');
  const router = useRouter();

  // Schéma local au rendu : les messages d'erreur Zod doivent capturer le `t` courant.
  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(tc('invalid_email')),
        password: z.string().min(1, t('password_required')),
      }),
    [t, tc],
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(schema) });

  async function onSubmit(data: LoginForm) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new ApiError(res.status, null, '');
      router.replace('/dashboard');
    } catch {
      setError('root', { message: t('error_credentials') });
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-100 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-zinc-900">Mizan</h1>
      <Card className="w-full shadow-md border border-zinc-200 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{tc('email')}</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{tc('password')}</Label>
              <PasswordInput id="password" autoComplete="current-password" {...register('password')} />
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>
            {errors.root && <p className="text-sm text-red-500">{errors.root.message}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t('submitting') : t('submit')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-zinc-500">
            {t('no_account')}{' '}
            <Link href="/register" className="font-medium text-zinc-900 underline underline-offset-2">
              {t('signup_link')}
            </Link>
          </p>
          <p className="mt-2 text-center text-sm">
            <Link href="/forgot-password" className="text-zinc-500 underline underline-offset-2">
              {t('forgot_password_link')}
            </Link>
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
