'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomers } from '@/lib/hooks/useCustomers';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { data, isLoading } = useCustomers(debouncedSearch);

  function handleSearch(value: string) {
    setSearch(value);
    clearTimeout((window as Window & { _st?: ReturnType<typeof setTimeout> })._st);
    (window as Window & { _st?: ReturnType<typeof setTimeout> })._st = setTimeout(
      () => setDebouncedSearch(value), 300,
    );
  }

  return (
    <>
      <TopBar
        title="Clients"
        action={
          <Link href="/customers/new">
            <Button size="sm">+ Ajouter</Button>
          </Link>
        }
      />
      <div className="flex flex-col gap-3 p-4">
        <Input
          placeholder="Rechercher un client…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />

        {isLoading && <p className="text-sm text-zinc-400 text-center py-8">Chargement…</p>}
        {data?.results.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-8">Aucun client trouvé.</p>
        )}

        <div className="flex flex-col gap-2">
          {data?.results.map((customer) => (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-sm text-zinc-900">{customer.name}</span>
                <div className="flex gap-3 text-xs text-zinc-400">
                  {customer.phone && <span>{customer.phone}</span>}
                  {customer.city && <span>{customer.city}</span>}
                </div>
              </div>
              <span className="text-zinc-400 text-lg">›</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
