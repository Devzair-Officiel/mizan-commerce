import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Manrope, Instrument_Serif } from 'next/font/google';
import './auth.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'mizan — Accès à votre boutique',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mzn-auth ${manrope.variable} ${instrumentSerif.variable}`}>
      <div className="au-top">
        <Link href="/" className="au-back" aria-label="Retour à l'accueil">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Retour à l&apos;accueil</span>
        </Link>
      </div>

      <Link href="/" className="au-brand" aria-label="mizan">
        <Image src="/landing/logo.png" alt="" width={44} height={44} priority />
        <span className="wm">mizan</span>
      </Link>

      <div className="au-wrap">{children}</div>
    </div>
  );
}
