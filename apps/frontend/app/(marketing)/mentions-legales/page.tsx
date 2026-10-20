// Source : docs/legal/mentions-legales.md — modifier les deux ensemble
import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/marketing/Nav';
import { Footer } from '@/components/marketing/Footer';

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
          <p>Dernière mise à jour : 17 octobre 2026</p>

          <h2>Éditeur</h2>
          <p>Le site mizan-commerce.com et l&apos;application Mizan sont édités par :</p>
          <p><strong>Houd Sarahoui, entrepreneur individuel (EI)</strong>, exerçant sous le nom commercial HYPEDESIGN</p>
          <ul>
            <li>Adresse : 9 rue Marie-Anne de Bovet, 57000 Metz, France</li>
            <li>E-mail : support@mizan-commerce.com</li>
            <li>SIREN : 835 317 413 — SIRET : 835 317 413 00036</li>
            <li>Numéro de TVA intracommunautaire : FR28835317413</li>
            <li>Code APE : 6201Z (programmation informatique)</li>
          </ul>

          <h2>Directeur de la publication</h2>
          <p>Houd Sarahoui.</p>

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
          <p>Pour toute question : support@mizan-commerce.com.</p>
        </article>
      </main>
      <Footer />
    </>
  );
}
