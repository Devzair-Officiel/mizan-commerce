'use client';

import { Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** PDF d'un document émis ou envoyé (facture, devis) ; `href` : son URL dans le proxy. */
export function PdfButton({ href, label, className }: { href: string; label: string; className?: string }) {
  return <a href={href} download
    className={cn(buttonVariants(), 'h-10 rounded-full px-4 font-semibold', className)}>
    <Download aria-hidden size={17} />{label}
  </a>;
}
