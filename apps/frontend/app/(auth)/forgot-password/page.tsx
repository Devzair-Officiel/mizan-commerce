'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z.object({
  email: z.string().email('Email invalide'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      setSent(true);
    } catch {
      setError('root', { message: 'Une erreur est survenue. Veuillez réessayer.' });
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-100 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-zinc-900">Mizan</h1>
        <Card className="w-full shadow-md border border-zinc-200 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Mot de passe oublié</CardTitle>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="flex flex-col gap-4 text-center">
                <p className="text-sm text-zinc-600">
                  Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.
                </p>
                <Link href="/login">
                  <Button variant="outline" className="w-full">Retour à la connexion</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <p className="text-sm text-zinc-500">
                  Entrez votre email pour recevoir un lien de réinitialisation.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" {...register('email')} />
                  {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                </div>
                {errors.root && <p className="text-sm text-red-500">{errors.root.message}</p>}
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Envoi…' : 'Envoyer le lien'}
                </Button>
                <p className="text-center text-sm">
                  <Link href="/login" className="text-zinc-500 underline underline-offset-2">
                    Retour à la connexion
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
