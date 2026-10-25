import type { Metadata } from 'next';
import Image from 'next/image';
import localFont from 'next/font/local';
import '../(auth)/auth.css';

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
  title: 'mizan — Démarrage de votre boutique',
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mzn-auth ${manrope.variable} ${instrumentSerif.variable}`}>
      <div className="au-brand" aria-label="mizan">
        <Image src="/landing/logo.png" alt="" width={44} height={44} priority />
        <span className="wm">mizan</span>
      </div>

      <div className="au-wrap">{children}</div>
    </div>
  );
}
