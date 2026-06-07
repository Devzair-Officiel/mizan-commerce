import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl résout la locale dynamiquement via `i18n/request.ts` (cookie + Accept-Language),
// pas via préfixe d'URL — l'app reste sur des routes sans `[locale]`.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isProd = process.env.NODE_ENV === "production";

function buildCspDirectives(frameAncestors: string) {
  return [
    "default-src 'self'",
    // Next.js injecte du script inline pour l'hydratation. Sans nonce, 'unsafe-inline' est requis.
    // À l'avenir : migrer vers nonce via middleware si on durcit encore.
    "script-src 'self' 'unsafe-inline'",
    // Tailwind/shadcn injectent du style — 'unsafe-inline' nécessaire pour les styled-jsx Next.
    "style-src 'self' 'unsafe-inline'",
    // Médias servis via bucket S3 privé OVH (URLs signées HTTPS) + data:/blob: pour previews uploads.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Le client ne parle qu'à son propre origin (proxies /api/*). Aucune fetch directe vers Django.
    "connect-src 'self'",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
}

const cspDirectives = buildCspDirectives("'none'");
// Les pages publiques /boutique/* peuvent être affichées en iframe par
// l'aperçu de l'éditeur (même origine uniquement).
const cspDirectivesBoutique = buildCspDirectives("'self'");

const securityHeaders = [
  // HSTS — force HTTPS pour 2 ans, inclut sous-domaines, éligible preload list.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Désactive caméra/micro/géoloc par défaut. Réactiver ponctuellement pour le module IA (V6).
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

if (isProd) {
  securityHeaders.push({
    key: "Content-Security-Policy",
    value: cspDirectives.join("; "),
  });
}

// Headers spécifiques aux routes /boutique/* : autorise l'embedding same-origin
// pour l'aperçu live dans l'éditeur de page.
const boutiqueHeaders = securityHeaders
  .filter((h) => h.key !== "X-Frame-Options" && h.key !== "Content-Security-Policy")
  .concat({ key: "X-Frame-Options", value: "SAMEORIGIN" });

if (isProd) {
  boutiqueHeaders.push({
    key: "Content-Security-Policy",
    value: cspDirectivesBoutique.join("; "),
  });
}

const nextConfig: NextConfig = {
  output: "standalone",
  // Masque l'en-tête `X-Powered-By: Next.js` (fingerprinting).
  poweredByHeader: false,
  // Typecheck et lint sont lancés en dev/CI avant chaque commit.
  // Les rejouer pendant `next build` sature la RAM du VPS et fait swap pendant ~45 min.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Plus spécifique en dernier : override les headers de frame pour autoriser
      // l'iframe same-origin (utilisé par l'aperçu de l'éditeur de vitrine).
      {
        source: "/boutique/:path*",
        headers: boutiqueHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
