import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const cspDirectives = [
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
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
];

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

const nextConfig: NextConfig = {
  output: "standalone",
  // Masque l'en-tête `X-Powered-By: Next.js` (fingerprinting).
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
