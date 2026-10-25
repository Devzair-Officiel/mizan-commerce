import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { getDirection, isLocale, DEFAULT_LOCALE } from '@/i18n/locales';
import './globals.css';

// Polices hébergées dans app/fonts (régénération : docs/ci.md). Une face par graisse, comme
// le faisait next/font/google : même sélection de graisse par le navigateur.
const geist = localFont({
  src: './fonts/geist/Geist-Variable.woff2',
  weight: '100 900',
  variable: '--font-geist',
});
const notoArabic = localFont({
  src: [
    { path: './fonts/noto-sans-arabic/NotoSansArabic-Variable.woff2', weight: '400' },
    { path: './fonts/noto-sans-arabic/NotoSansArabic-Variable.woff2', weight: '500' },
    { path: './fonts/noto-sans-arabic/NotoSansArabic-Variable.woff2', weight: '600' },
    { path: './fonts/noto-sans-arabic/NotoSansArabic-Variable.woff2', weight: '700' },
  ],
  display: 'swap',
  variable: '--font-arabic',
});

export const metadata: Metadata = {
  title: 'Mizan — Gestion boutique',
  description: 'SaaS mobile-first pour petits commerçants',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale résolue par `i18n/request.ts` (cookie NEXT_LOCALE > Accept-Language > fr).
  // `getLocale()` retourne toujours une string ; on la borne pour le typage `dir`.
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const dir = getDirection(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${geist.variable} ${notoArabic.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applique data-primary / data-bg avant hydration pour éviter le flash de couleur */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem('mizan-primary-color')||'sage';var b=localStorage.getItem('mizan-bg-color')||'cream';document.documentElement.setAttribute('data-primary',p);document.documentElement.setAttribute('data-bg',b);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <QueryProvider>{children}</QueryProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
