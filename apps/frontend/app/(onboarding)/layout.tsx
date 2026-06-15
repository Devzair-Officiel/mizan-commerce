import type { Metadata } from 'next';
import Image from 'next/image';
import { Manrope, Instrument_Serif } from 'next/font/google';
import '../(auth)/auth.css';

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
