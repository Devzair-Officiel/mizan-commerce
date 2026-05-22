import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: 'Mizan — Gestion boutique',
  description: 'SaaS mobile-first pour petits commerçants',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Script synchrone : applique le thème couleur avant le premier rendu pour éviter le flash */}
        {/* Applique data-color-theme avant hydration → gradient CSS synchrone, sans flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem('mizan-primary-color')||'mint';var b=localStorage.getItem('mizan-bg-color')||'default';document.documentElement.setAttribute('data-primary',p);document.documentElement.setAttribute('data-bg',b);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full font-sans">
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
