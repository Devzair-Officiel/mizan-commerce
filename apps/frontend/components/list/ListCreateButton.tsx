import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ListCreateButtonProps {
  href: string;
  label: string;
}

/** Action de création d'une page de liste, dans l'en-tête (desktop). */
export function ListCreateButton({ href, label }: ListCreateButtonProps) {
  return (
    <Button
      render={<Link href={href} />}
      className="hidden h-11 rounded-full px-5 text-sm font-semibold lg:inline-flex"
    >
      <Plus aria-hidden />
      {label}
    </Button>
  );
}
