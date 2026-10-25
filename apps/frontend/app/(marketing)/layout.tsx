import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './marketing.css';

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

const amiri = localFont({
  src: [
    { path: '../fonts/amiri/Amiri-Regular.woff2', weight: '400' },
    { path: '../fonts/amiri/Amiri-Bold.woff2', weight: '700' },
  ],
  variable: '--font-amiri',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

export const metadata: Metadata = {
  title: 'mizan — Tout votre commerce, dans une seule app',
  description:
    'mizan rassemble stock, commandes, clients, zakat et messages dans une seule application mobile. Pensé pour le commerçant, pensé halal.',
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mkt ${manrope.variable} ${instrumentSerif.variable} ${amiri.variable}`}>
      {children}
    </div>
  );
}
