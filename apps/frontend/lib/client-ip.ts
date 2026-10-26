/**
 * Adresse du visiteur transmise au backend Django (côté serveur uniquement). Sans elle, toutes les
 * requêtes arrivent avec l'adresse du conteneur Next.js et partagent les mêmes limites par IP
 * (connexion, rafraîchissement, page publique) : 10 connexions par minute pour tout le site.
 *
 * Caddy remplace le X-Forwarded-For envoyé par le navigateur par l'adresse réelle (aucun proxy de
 * confiance configuré) ; sans Caddy (pile locale), Next.js pose l'adresse de la connexion. Django
 * lit la dernière entrée (REST_FRAMEWORK['NUM_PROXIES'] = 1) : l'unique valeur posée ici.
 */
const IP_PATTERN = /^[0-9a-fA-F.:]{2,45}$/;

export function clientIpHeaders(incoming: Headers): Record<string, string> {
  const ip = incoming.get('x-forwarded-for')?.split(',')[0]?.trim();
  return ip && IP_PATTERN.test(ip) ? { 'X-Forwarded-For': ip } : {};
}
