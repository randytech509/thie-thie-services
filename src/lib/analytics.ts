/**
 * Mesure d'audience — Google Analytics 4 + Microsoft Clarity.
 *
 * POURQUOI LES DEUX : ils ne mesurent pas la même chose et se complètent mal séparément.
 * GA4 répond au « combien » (visiteurs, sources, entonnoir d'achat, conversions) ; Clarity
 * répond au « pourquoi » (enregistrements de session, cartes de chaleur, clics de rage,
 * défilements morts). Sur une boutique, GA4 dit qu'on perd 60 % des gens au panier, Clarity
 * montre le bouton sur lequel ils s'acharnent sans effet.
 *
 * RIEN NE SE CHARGE SANS CONSENTEMENT EXPLICITE. Les deux outils posent des cookies de suivi
 * et Clarity enregistre en plus le comportement à l'écran. La page « Confidentialité » du site
 * deviendrait mensongère si on les activait en silence. Défaut = refus ; aucun script n'est
 * injecté tant que le visiteur n'a pas accepté.
 *
 * Les identifiants viennent de l'environnement (VITE_GA4_ID / VITE_CLARITY_ID) : sans eux, le
 * module reste inerte, ce qui laisse le développement et les tests non tracés.
 */

const GA4_ID = import.meta.env.VITE_GA4_ID as string | undefined;
const CLARITY_ID = import.meta.env.VITE_CLARITY_ID as string | undefined;

const CONSENT_KEY = 'tt-analytics-consent';

export type Consent = 'granted' | 'denied';

/** null = le visiteur n'a pas encore répondu (on ne trace pas, et on lui demande). */
export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null; // navigation privée / stockage bloqué : on ne trace pas.
  }
}

export function writeConsent(value: Consent): void {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* rien à faire : sans stockage, la question sera reposée, ce qui est le comportement sûr */
  }
}

export function isAnalyticsConfigured(): boolean {
  return Boolean(GA4_ID || CLARITY_ID);
}

let loaded = false;

/** Injecte les scripts. Idempotent : un double appel (re-render, changement de page) ne duplique rien. */
export function initAnalytics(): void {
  if (loaded) return;
  if (readConsent() !== 'granted') return;
  if (!isAnalyticsConfigured()) return;
  loaded = true;

  if (GA4_ID) loadGa4(GA4_ID);
  if (CLARITY_ID) loadClarity(CLARITY_ID);
}

/** Appelé après un clic « Accepter » : charge sans recharger la page. */
export function grantAndInit(): void {
  writeConsent('granted');
  initAnalytics();
}

export function denyAnalytics(): void {
  writeConsent('denied');
  // Rien à décharger : si l'on est ici, aucun script n'a été injecté.
}

function loadGa4(id: string): void {
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);

  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  // gtag DOIT pousser `arguments` tel quel (et non un tableau reconstruit) : c'est le contrat
  // attendu par le script de Google.
  w.gtag = function gtag() { w.dataLayer.push(arguments); };
  w.gtag('js', new Date());
  // anonymize_ip : on n'a aucun besoin de l'IP exacte d'un client pour compter des visites.
  w.gtag('config', id, { anonymize_ip: true });
}

function loadClarity(id: string): void {
  const w = window as any;
  if (w.clarity) return;
  w.clarity = w.clarity || function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

/**
 * Événement personnalisé (achat, dépôt, échec de paiement…). Sans consentement ou sans GA4
 * configuré, l'appel ne fait rien — les appelants n'ont donc pas à tester quoi que ce soit.
 */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  const w = window as any;
  if (typeof w.gtag !== 'function') return;
  w.gtag('event', name, params ?? {});
}
