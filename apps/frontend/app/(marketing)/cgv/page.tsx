// Source : docs/legal/cgv.md — modifier les deux ensemble
import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/marketing/Nav';
import { Footer } from '@/components/marketing/Footer';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Conditions générales de vente et d’utilisation — Mizan',
  description: 'Formules, essai gratuit, prix, paiement, résiliation et responsabilités pour l’utilisation de Mizan.',
};

function ServiceAndAccount() {
  return (
    <>
      <h2>1. Éditeur et objet</h2>
      <p>{LEGAL.product} est un service en ligne de gestion pour les commerçants : stock, commandes, clients, factures, zakat commerciale, entre autres. Il est édité par {LEGAL.name}, {LEGAL.legalForm}, exerçant sous le nom commercial {LEGAL.tradeName}. Ses coordonnées complètes figurent dans les <Link href="/mentions-legales">mentions légales</Link>.</p>
      <p>Ces conditions encadrent l&apos;utilisation de Mizan et la souscription de ses formules.</p>

      <h2>2. Service réservé aux professionnels</h2>
      <p>Mizan est réservé aux professionnels : commerçants, artisans et indépendants qui l&apos;utilisent pour leur activité. Dans ces conditions, « vous » désigne ce client professionnel.</p>
      <p>Le droit de rétractation prévu pour les consommateurs ne s&apos;applique pas.</p>

      <h2>3. Votre compte</h2>
      <p>Vous fournissez des informations exactes. Vos identifiants sont confidentiels : ne les communiquez à personne.</p>
      <p>Le propriétaire de la boutique répond des membres qu&apos;il ajoute à son équipe. Il est le seul à gérer l&apos;abonnement.</p>

      <h2>4. Formules</h2>
      <p>Mizan propose quatre formules : Découverte, gratuite et sans limite de durée, puis Solo, Boutique et Commerce+.</p>
      <p>Les fonctionnalités et les plafonds de chaque formule sont ceux de la <Link href="/#pricing">page Tarifs</Link> au moment de votre souscription. Ils peuvent évoluer, sans vous retirer ce que vous avez souscrit pendant votre période en cours.</p>

      <h2>5. Essai gratuit</h2>
      <p>Vous pouvez essayer la formule Boutique gratuitement pendant 14 jours, sans carte bancaire. L&apos;essai n&apos;est accordé qu&apos;une fois par utilisateur.</p>
      <p>À son terme, votre boutique repasse automatiquement sur Découverte, sauf si vous avez souscrit une formule payante. Vos données sont conservées.</p>
    </>
  );
}

function PricesAndBilling() {
  return (
    <>
      <h2>6. Prix</h2>
      <p>Les prix sont indiqués en euros. {LEGAL.vatNotice}.</p>
      <p>Vous choisissez un paiement mensuel ou annuel. Un changement de prix s&apos;applique au renouvellement suivant, après un préavis de 30 jours envoyé par e-mail ; vous pouvez résilier avant qu&apos;il prenne effet.</p>

      <h2>7. Paiement</h2>
      <p>Le paiement passe par Stripe, avec les moyens proposés au moment de la souscription. Chaque période est payée à son début. En souscrivant, vous autorisez le prélèvement récurrent du prix de votre formule.</p>
      <p>Un reçu et une facture vous sont envoyés par e-mail ; ils restent disponibles dans le portail de facturation.</p>

      <h2>8. Durée, renouvellement et résiliation</h2>
      <p>L&apos;abonnement, mensuel ou annuel, est reconduit automatiquement.</p>
      <p>Vous pouvez le résilier à tout moment, en ligne, depuis Mizan (page Abonnement) ou depuis le portail de facturation. La résiliation prend effet à la fin de la période déjà payée : vous gardez un accès complet jusque-là. Vous pouvez l&apos;annuler avant cette date.</p>

      <h2>9. Changement de formule</h2>
      <p>Le passage à une formule supérieure s&apos;applique immédiatement, après votre confirmation : la différence est facturée au prorata du temps restant sur la période en cours.</p>
      <p>Le passage à une formule inférieure s&apos;applique à la fin de la période en cours.</p>

      <h2>10. Défaut de paiement</h2>
      <p>Si un paiement échoue, des relances automatiques vous sont envoyées. Vous gardez l&apos;accès à votre formule payante pendant 15 jours après l&apos;échec.</p>
      <p>Sans règlement dans ce délai, l&apos;abonnement est résilié et votre boutique repasse sur Découverte. Vos données sont conservées.</p>

      <h2>11. Remboursement</h2>
      <p>Les sommes versées ne sont pas remboursées. Un geste commercial reste possible, au cas par cas, sur demande à {LEGAL.email}.</p>
    </>
  );
}

function ServiceCommitments() {
  return (
    <>
      <h2>12. Disponibilité et support</h2>
      <p>Mizan est fourni avec des soins raisonnables, sans garantie d&apos;absence d&apos;interruption. Le support est assuré par e-mail, à {LEGAL.email}.</p>

      <h2>13. Aides au calcul</h2>
      <p>Les calculs de zakat, de TVA, de totaux et de factures proposés par Mizan sont des aides. La zakat affichée est une estimation indicative : elle ne remplace pas l&apos;avis d&apos;une personne compétente.</p>
      <p>Vous restez responsable de vos obligations comptables, fiscales et légales, et de l&apos;exactitude de vos données.</p>

      {/* À faire relire par un juriste : article 14 (sous-traitance, art. 28 du RGPD). */}
      <h2>14. Données personnelles</h2>
      <p>Vous êtes responsable du traitement des données personnelles de vos propres clients que vous enregistrez dans Mizan. Pour ces données, Mizan agit comme sous-traitant :</p>
      <ul>
        <li>il les traite uniquement sur vos instructions ;</li>
        <li>il en assure la sécurité ;</li>
        <li>il ne fait appel qu&apos;aux prestataires listés dans la politique de confidentialité ;</li>
        <li>il vous aide à répondre aux personnes qui exercent leurs droits ;</li>
        <li>il vous notifie toute violation de ces données ;</li>
        <li>à la fin du contrat, il les efface ou vous les restitue.</li>
      </ul>
      <p>Le traitement des données de votre compte est décrit dans la <Link href="/confidentialite">politique de confidentialité</Link>.</p>

      <h2>15. Propriété intellectuelle</h2>
      <p>Pendant votre abonnement, vous bénéficiez d&apos;une licence d&apos;utilisation de Mizan non exclusive, personnelle et non transférable.</p>
      <p>Vous restez propriétaire des contenus que vous ajoutez dans Mizan.</p>
    </>
  );
}

function LiabilityAndTerms() {
  return (
    <>
      {/* À faire relire par un juriste : article 16 (plafond de responsabilité). */}
      <h2>16. Responsabilité</h2>
      <p>La responsabilité de l&apos;éditeur est limitée aux dommages directs et plafonnée aux sommes que vous avez versées pendant les 12 derniers mois. Elle n&apos;est pas engagée pour les dommages indirects.</p>
      <p>Ces limites ne s&apos;appliquent pas en cas de faute lourde ou dolosive.</p>

      {/* À faire relire par un juriste : article 17 (suspension, délai de la mise en demeure). */}
      <h2>17. Suspension</h2>
      <p>En cas de manquement grave à ces conditions ou d&apos;usage frauduleux, l&apos;éditeur peut suspendre votre accès après une mise en demeure par e-mail restée sans effet, sauf urgence.</p>

      <h2>18. Modification des conditions</h2>
      <p>Vous êtes informé de toute modification de ces conditions par e-mail ou dans l&apos;application, au moins 30 jours avant son entrée en vigueur. Vous pouvez alors résilier votre abonnement.</p>

      {/* À faire relire par un juriste : article 19 (droit applicable, juridiction). */}
      <h2>19. Droit applicable et litiges</h2>
      <p>Ces conditions sont soumises au droit français. En cas de litige, une solution amiable est d&apos;abord recherchée. À défaut, le litige est porté devant les tribunaux compétents du ressort du siège de l&apos;éditeur.</p>

      <h2>20. Contact</h2>
      <p>Pour toute question sur ces conditions : {LEGAL.email}.</p>
    </>
  );
}

export default function CgvPage() {
  return (
    <>
      <Nav />
      <main className="wrap" lang="fr" dir="ltr">
        <article className="legal">
          <h1>Conditions générales de vente et d&apos;utilisation</h1>
          <p>Dernière mise à jour : 25 octobre 2026</p>
          <ServiceAndAccount />
          <PricesAndBilling />
          <ServiceCommitments />
          <LiabilityAndTerms />
        </article>
      </main>
      <Footer />
    </>
  );
}
