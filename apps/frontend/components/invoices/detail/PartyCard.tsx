import type { ReactNode } from 'react';
import { SectionCard } from '@/components/ui/SectionCard';

interface PartyCardProps {
  title: string; name: string; address: string; extras: (string | undefined)[];
  mark?: ReactNode; rightLink?: { href: string; label: string };
}

export function PartyCard({ title, name, address, extras, mark, rightLink }: PartyCardProps) {
  return <SectionCard title={title} rightLink={rightLink}>
    <div className="flex flex-col gap-2 px-4 py-4 lg:px-5">
      {mark}
      <p className="text-sm font-semibold break-words">{name}</p>
      {address && <p className="text-[0.8125rem] text-muted-foreground whitespace-pre-wrap break-words">{address}</p>}
      {extras.filter(Boolean).map((extra, index) => <p key={index} dir="ltr" className="text-xs text-muted-foreground break-words">{extra}</p>)}
    </div>
  </SectionCard>;
}
