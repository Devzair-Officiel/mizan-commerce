'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type RegisterForm = {
  email: string;
  full_name: string;
  shop_name: string;
  password: string;
};

export default function RegisterPage() {
  const t = useTranslations('auth.register');
  const tc = useTranslations('auth.common');
  const [registered, setRegistered] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(tc('invalid_email')),
        full_name: z.string().min(2, t('full_name_required')),
        shop_name: z.string().min(2, t('shop_name_required')),
        password: z.string().min(8, t('password_min')),
      }),
    [t, tc],
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(schema) });

  async function onSubmit(data: RegisterForm) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      setError('root', { message: t('error_generic') });
      return;
    }
    setRegistered(true);
  }

  if (registered) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-100 px-4">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-zinc-900">Mizan</h1>
          <Card className="w-full shadow-md border border-zinc-200 bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{t('check_email_title')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-center">
              <p className="text-sm text-zinc-600">{t('check_email_body')}</p>
              <Link href="/login">
                <Button variant="outline" className="w-full">{tc('back_to_login')}</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-100 px-4 py-8">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-zinc-900">Mizan</h1>
      <Card className="w-full shadow-md border border-zinc-200 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="full_name">{t('full_name')}</Label>
              <Input id="full_name" autoComplete="name" {...register('full_name')} />
              {errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shop_name">{t('shop_name')}</Label>
              <Input id="shop_name" {...register('shop_name')} />
              {errors.shop_name && <p className="text-xs text-red-500">{errors.shop_name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{tc('email')}</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{tc('password')}</Label>
              <PasswordInput id="password" autoComplete="new-password" {...register('password')} />
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>
            {errors.root && <p className="text-sm text-red-500">{errors.root.message}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t('submitting') : t('submit')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-zinc-500">
            {t('have_account')}{' '}
            <Link href="/login" className="font-medium text-zinc-900 underline underline-offset-2">
              {t('signin_link')}
            </Link>
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
