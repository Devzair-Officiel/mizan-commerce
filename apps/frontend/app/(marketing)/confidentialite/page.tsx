// Source : docs/legal/confidentialite.md — modifier les deux ensemble
import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/marketing/Nav';
import { Footer } from '@/components/marketing/Footer';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Mizan',
  description: 'Données personnelles traitées par Mizan, finalités, conservation, prestataires, cookies et exercice de vos droits.',
};

function DataProcessing() {
  return (
    <>
      <h2>1. Responsable du traitement</h2>
      <p>Les données des comptes Mizan sont traitées par {LEGAL.name}, {LEGAL.legalForm}, exerçant sous le nom commercial {LEGAL.tradeName}, éditeur de Mizan. Ses coordonnées complètes figurent dans les <Link href="/mentions-legales">mentions légales</Link>.</p>
      <p>Pour toute question ou demande : <strong>{LEGAL.email}</strong>.</p>

      <h2>2. Deux situations différentes</h2>
      <p><strong>Les données de votre compte</strong> (vous, commerçant, et les membres de votre équipe) : Mizan en est responsable. C&apos;est l&apos;objet de cette politique.</p>
      <p><strong>Les données que vous enregistrez sur vos propres clients</strong> (nom, téléphone, adresse, notes, commandes, factures) : c&apos;est vous, commerçant, qui en êtes responsable. Mizan les traite uniquement pour votre compte, pour faire fonctionner le service, et ne les utilise à aucune autre fin.</p>
      <p>Si vous êtes client d&apos;un commerçant qui utilise Mizan, adressez vos demandes concernant vos données à ce commerçant.</p>

      <h2>3. Données traitées</h2>
      <ul>
        <li><strong>Compte</strong> : adresse e-mail, mot de passe (enregistré sous forme hachée, jamais lisible), nom et téléphone si vous les renseignez, langue et préférences d&apos;affichage.</li>
        <li><strong>Boutique</strong> : nom, pays, devise ; pour vos factures, si vous les ajoutez : adresse, SIRET, numéro de TVA, mentions légales, IBAN et BIC, logo.</li>
        <li><strong>Activité</strong> : articles, stock, commandes, factures, rappels, notes, calculs de zakat, messages préparés, factures fournisseurs importées.</li>
        <li><strong>Journal d&apos;activité</strong> : qui a fait quelle action importante, et quand (modification de stock, changement de statut d&apos;une commande, export…).</li>
        <li><strong>Abonnement</strong> : formule choisie, dates de l&apos;essai et de l&apos;abonnement ; pour une formule payante, nom ou raison sociale, adresse de facturation, e-mail et factures. Mizan ne voit ni ne conserve les numéros de carte.</li>
        <li><strong>Données techniques</strong> : adresse IP (pour limiter les tentatives de connexion) et rapports d&apos;erreurs.</li>
      </ul>

      <h2 id="finalites">4. Pourquoi nous les utilisons</h2>
      <div className="legal-table" role="region" aria-labelledby="finalites" tabIndex={0}>
        <table>
          <thead>
            <tr><th scope="col">Finalité</th><th scope="col">Base légale</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Créer et gérer votre compte, fournir le service, envoyer les e-mails nécessaires (vérification de l&apos;adresse, nouveau mot de passe, résumé du jour si vous l&apos;activez)</td>
              <td>Exécution du contrat</td>
            </tr>
            <tr>
              <td>Gérer votre abonnement payant : paiement, facturation, factures</td>
              <td>Exécution du contrat</td>
            </tr>
            <tr>
              <td>Tenir la comptabilité et conserver les factures</td>
              <td>Obligations légales</td>
            </tr>
            <tr>
              <td>Protéger le service : vérification anti-robots à l&apos;inscription, limitation des tentatives de connexion, journal d&apos;activité, suivi des erreurs</td>
              <td>Intérêt légitime : la sécurité du service et de vos données</td>
            </tr>
            <tr>
              <td>Répondre à vos demandes au support</td>
              <td>Intérêt légitime</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Pas de publicité, pas de revente de données, pas de profilage. Mizan n&apos;envoie aujourd&apos;hui aucun e-mail promotionnel ; si cela change, votre accord vous sera demandé au préalable.</p>

      <h2>5. Qui a accès à vos données</h2>
      <ul>
        <li><strong>Les membres de votre boutique</strong>, selon les droits que vous leur donnez.</li>
        <li><strong>L&apos;éditeur de Mizan</strong>, uniquement pour le support, la maintenance et la sécurité.</li>
        <li>
          <strong>Nos prestataires</strong>, chacun pour sa seule mission :
          <ul>
            <li><strong>OVHcloud</strong> (France) : hébergement de l&apos;application, de la base de données, des fichiers et des sauvegardes ; envoi des e-mails.</li>
            <li><strong>Stripe</strong> (Stripe Payments Europe, Ltd, Irlande, et les sociétés du groupe Stripe, dont celles des États-Unis) : paiement et facturation des abonnements. Les numéros de carte sont saisis chez Stripe : Mizan ne les voit ni ne les conserve. Si vous choisissez de payer avec PayPal, PayPal traite aussi ce paiement.</li>
            <li><strong>Google</strong> (reCAPTCHA) : vérification anti-robots, sur la page d&apos;inscription uniquement.</li>
            <li><strong>OpenAI</strong> : lecture automatique des factures fournisseurs que vous importez, pour en extraire les lignes.</li>
            <li><strong>Sentry</strong> : suivi des erreurs techniques, configuré pour ne transmettre aucune donnée personnelle.</li>
          </ul>
        </li>
      </ul>
      <p>Aucune donnée n&apos;est vendue ni cédée.</p>

      <h2>6. Transferts hors de l&apos;Union européenne</h2>
      <p>Google, OpenAI et Sentry sont des sociétés américaines. Stripe traite les données depuis l&apos;Irlande et peut les transmettre aux sociétés de son groupe, dont celles des États-Unis. Lorsque des données leur sont transmises, ce transfert est encadré par les garanties prévues par le RGPD : décision d&apos;adéquation de la Commission européenne (Data Privacy Framework) pour les entreprises certifiées, ou clauses contractuelles types.</p>
    </>
  );
}

function RetentionAndRights() {
  return (
    <>
      <h2>7. Durées de conservation</h2>
      <ul>
        <li><strong>Compte, boutique et activité</strong> : tant que votre compte existe. Après une demande de suppression, les données sont effacées dans un délai d&apos;un mois au plus, puis disparaissent des sauvegardes chiffrées au bout de 30 jours.</li>
        <li><strong>Journal d&apos;activité</strong> : tant que la boutique existe.</li>
        <li><strong>Factures d&apos;abonnement</strong> : 10 ans, pour les obligations comptables.</li>
        <li><strong>Adresse IP utilisée pour limiter les tentatives</strong> : une heure au plus.</li>
        <li><strong>Journaux techniques et rapports d&apos;erreurs</strong> : durée limitée, puis effacement automatique.</li>
        <li><strong>Échanges avec le support</strong> : 3 ans après le dernier échange.</li>
      </ul>

      <h2>8. Cookies et stockage dans le navigateur</h2>
      <p>Mizan utilise uniquement ce qui est nécessaire à son fonctionnement :</p>
      <ul>
        <li><code>access_token</code> et <code>refresh_token</code> : vous garder connecté (1 heure et 30 jours). Ces cookies sont inaccessibles aux scripts de la page.</li>
        <li><code>NEXT_LOCALE</code> : mémoriser la langue choisie.</li>
        <li>Stockage local du navigateur : mémoriser les couleurs d&apos;affichage choisies.</li>
        <li>reCAPTCHA (page d&apos;inscription uniquement) : Google peut lire ou déposer des cookies pour distinguer un humain d&apos;un robot.</li>
        <li>Pages hébergées par Stripe (paiement, portail de facturation) : Stripe peut y déposer ses propres cookies.</li>
      </ul>
      <p>Aucun cookie publicitaire, aucun outil de mesure d&apos;audience.</p>

      <h2>9. Sécurité</h2>
      <p>Connexion chiffrée (HTTPS), mots de passe hachés, jetons de connexion inaccessibles aux scripts, données de chaque boutique séparées, fichiers dans un stockage privé à accès temporaire, sauvegardes chiffrées.</p>

      <h2>10. Vos droits</h2>
      <p>Vous pouvez demander l&apos;accès à vos données, leur rectification, leur effacement, leur portabilité, la limitation de leur traitement, ou vous opposer à un traitement fondé sur l&apos;intérêt légitime. Vous pouvez aussi définir des directives sur le sort de vos données après votre décès.</p>
      <p>Une grande partie de vos informations se modifie directement dans <strong>Mon profil</strong> et <strong>Paramètres</strong>. Pour le reste, écrivez à <strong>{LEGAL.email}</strong> depuis l&apos;adresse de votre compte ; nous répondons dans un délai d&apos;un mois.</p>
      <p>Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL (cnil.fr).</p>

      <h2>11. Modifications</h2>
      <p>Cette politique peut évoluer. La date de dernière mise à jour figure en haut de la page ; en cas de changement important, vous serez prévenu par e-mail ou dans l&apos;application.</p>
    </>
  );
}

export default function ConfidentialitePage() {
  return (
    <>
      <Nav />
      <main className="wrap" lang="fr" dir="ltr">
        <article className="legal">
          <h1>Politique de confidentialité</h1>
          <p>Dernière mise à jour : 25 octobre 2026</p>
          <p>Mizan est une application de gestion pour les commerçants. Cette page explique quelles données personnelles nous traitons, pourquoi, combien de temps, avec qui, et comment exercer vos droits.</p>
          <DataProcessing />
          <RetentionAndRights />
        </article>
      </main>
      <Footer />
    </>
  );
}
