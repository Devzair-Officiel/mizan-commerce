// Source : docs/legal/mentions-legales.md — modifier les deux ensemble
import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/marketing/Nav';
import { Footer } from '@/components/marketing/Footer';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Mentions légales — Mizan',
  description: 'Éditeur, hébergement, propriété intellectuelle et contact du site et de l’application Mizan.',
};

export default function MentionsLegalesPage() {
  return (
    <>
      <Nav />
      <main className="wrap" lang="fr" dir="ltr">
        <article className="legal">
          <h1>Mentions légales</h1>
          <p>Dernière mise à jour : 25 octobre 2026</p>

          <h2>Éditeur</h2>
          <p>Le site mizan-commerce.com et l&apos;application {LEGAL.product} sont édités par :</p>
          <p><strong>{LEGAL.name}, {LEGAL.legalForm}</strong>, exerçant sous le nom commercial {LEGAL.tradeName}</p>
          <ul>
            <li>Adresse : {LEGAL.address}</li>
            <li>E-mail : {LEGAL.email}</li>
            <li>SIREN : {LEGAL.siren} — SIRET : {LEGAL.siret}</li>
            <li>Code APE : {LEGAL.apeCode} ({LEGAL.apeLabel})</li>
            <li>{LEGAL.vatNotice}</li>
          </ul>

          <h2>Directeur de la publication</h2>
          <p>{LEGAL.publicationDirector}.</p>

          <h2>Hébergement</h2>
          <p>
            OVH SAS<br />
            2 rue Kellermann, 59100 Roubaix, France<br />
            Téléphone : +33 9 72 10 10 07<br />
            ovhcloud.com
          </p>
          <p>L&apos;application et ses données sont hébergées en France.</p>

          <h2>Propriété intellectuelle</h2>
          <p>Le nom et le logo Mizan, les textes, illustrations et la présentation du site, ainsi que le code de l&apos;application, sont protégés par le droit de la propriété intellectuelle. Toute reproduction ou réutilisation, même partielle, sans autorisation écrite préalable est interdite.</p>
          <p>Les contenus que les commerçants ajoutent dans l&apos;application (articles, photos, logos, textes) restent leur propriété.</p>

          <h2>Données personnelles et cookies</h2>
          <p>Le traitement des données personnelles et l&apos;usage des cookies sont décrits dans la <Link href="/confidentialite">politique de confidentialité</Link>. Le site n&apos;utilise ni cookie publicitaire ni outil de mesure d&apos;audience.</p>

          <h2>Contact</h2>
          <p>Pour toute question : {LEGAL.email}.</p>
        </article>
      </main>
      <Footer />
    </>
  );
}
