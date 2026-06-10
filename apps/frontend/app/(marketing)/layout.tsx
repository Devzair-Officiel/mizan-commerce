import type { Metadata } from 'next';
import { Manrope, Instrument_Serif, Amiri } from 'next/font/google';
import './marketing.css';

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

const amiri = Amiri({
  subsets: ['arabic'],
  weight: ['400', '700'],
  variable: '--font-amiri',
  display: 'swap',
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
