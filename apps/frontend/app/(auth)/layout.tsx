import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import localFont from 'next/font/local';
import './auth.css';

// Polices hébergées dans app/fonts (régénération : docs/ci.md), une face par graisse.
const manrope = localFont({
  src: [
    { path: '../fonts/manrope/Manrope-Variable.woff2', weight: '500' },
    { path: '../fonts/manrope/Manrope-Variable.woff2', weight: '600' },
    { path: '../fonts/manrope/Manrope-Variable.woff2', weight: '700' },
    { path: '../fonts/manrope/Manrope-Variable.woff2', weight: '800' },
  ],
  variable: '--font-manrope',
  display: 'swap',
});

const instrumentSerif = localFont({
  src: [
    { path: '../fonts/instrument-serif/InstrumentSerif-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/instrument-serif/InstrumentSerif-Italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

export const metadata: Metadata = {
  title: 'mizan — Accès à votre boutique',
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('auth.common');
  return (
    <div className={`mzn-auth ${manrope.variable} ${instrumentSerif.variable}`}>
      <div className="au-top">
        <Link href="/" className="au-back" aria-label={t('back_home')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{t('back_home')}</span>
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
