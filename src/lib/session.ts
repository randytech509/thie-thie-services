import { httpsCallable } from 'firebase/functions';
import { functionsClient } from '../firebase';

/**
 * Suivi de session côté client.
 *
 * Le rôle du client se limite à fournir un identifiant d'appareil STABLE et à déclencher
 * l'enregistrement. Tout ce qui doit être digne de confiance — IP, user-agent — est constaté
 * par le serveur (cf. functions/src/sessions.ts). Le `deviceId` n'est qu'une clé de document,
 * jamais une preuve.
 */

const DEVICE_KEY = 'tt-device-id';

/** Identifiant d'appareil persistant, généré une fois. En navigation privée ou stockage
 *  bloqué, on retombe sur un id éphémère — la session ne sera juste pas dédupliquée. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `d-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `ephemere-${Math.random().toString(36).slice(2)}`;
  }
}

let dernierEnvoi = 0;
const THROTTLE_MS = 5 * 60 * 1000; // au plus une écriture toutes les 5 min par appareil

/**
 * Enregistre / rafraîchit la session. Sûr à appeler souvent : throttlé à 5 min, et toute
 * erreur est avalée — le suivi de session ne doit jamais gêner l'usage de l'app.
 * `force` (à la connexion) court-circuite le throttle.
 */
export async function touchSession(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - dernierEnvoi < THROTTLE_MS) return;
  dernierEnvoi = now;
  try {
    await httpsCallable(functionsClient, 'recordSession')({ deviceId: deviceId() });
  } catch {
    dernierEnvoi = 0; // échec : ne pas bloquer la prochaine tentative sur le throttle
  }
}

/** Marque la session terminée (déconnexion). Erreur ignorée : la déconnexion locale prime. */
export async function endSession(): Promise<void> {
  try {
    await httpsCallable(functionsClient, 'endSession')({ deviceId: deviceId() });
  } catch { /* sans effet sur la déconnexion */ }
}
