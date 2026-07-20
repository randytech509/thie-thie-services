import { Firestore, Timestamp } from 'firebase-admin/firestore';

/**
 * Limiteur de débit à fenêtre fixe, partagé par les endpoints publics (`onRequest`).
 *
 * POURQUOI Firestore et pas un compteur en mémoire : les functions Gen2 sont sans état et
 * scalent horizontalement — un compteur d'instance serait remis à zéro à chaque démarrage à
 * froid et contourné en tapant assez vite pour toucher plusieurs instances. Le coût (1 lecture
 * + au plus 1 écriture par requête) est négligeable au volume d'un webhook de dépôt.
 *
 * FAIL-OPEN ASSUMÉ : si Firestore est indisponible, `consumeRateLimit` laisse PASSER la requête.
 * Ces webhooks créditent des wallets ; une panne du limiteur ne doit jamais bloquer un dépôt
 * légitime. Le limiteur est une défense contre l'abus, pas un invariant financier — ceux-là sont
 * tenus par le secret partagé, la signature HMAC et le rapprochement strict.
 *
 * NETTOYAGE : chaque document porte `expiresAt`. Poser une politique TTL Firestore sur la
 * collection `rate_limits` (champ `expiresAt`) pour la purge automatique ; sans elle les
 * documents s'accumulent (quelques octets par IP et par fenêtre, sans effet fonctionnel).
 */

export interface RateLimitRule {
  /** Nombre de requêtes autorisées par fenêtre. */
  limit: number;
  /** Durée de la fenêtre, en secondes. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requêtes restantes dans la fenêtre courante (0 si bloqué). */
  remaining: number;
  /** Secondes avant la réouverture de la fenêtre — sert d'en-tête `Retry-After`. */
  retryAfterSec: number;
}

/** Fenêtre glissante par IP sur l'ensemble des requêtes : plafonne le flood et le coût. */
export const WEBHOOK_IP_RULE: RateLimitRule = { limit: 60, windowSec: 60 };

/**
 * Fenêtre séparée, bien plus stricte, sur les seuls échecs d'authentification (secret SMS
 * erroné, signature HMAC invalide). C'est ce qui rend le brute-force du secret impraticable :
 * 10 essais par quart d'heure et par IP.
 */
export const WEBHOOK_AUTH_FAIL_RULE: RateLimitRule = { limit: 10, windowSec: 900 };

/**
 * Consomme un jeton pour `key`. Renvoie `allowed:false` quand la fenêtre est saturée.
 *
 * Une requête déjà bloquée n'est PAS ré-écrite (lecture seule) : sous flood on évite de payer
 * une écriture Firestore par requête refusée. La fenêtre expire donc bien à `windowStart +
 * windowSec`, quel que soit le nombre de tentatives refusées entre-temps.
 */
export async function consumeRateLimit(
  db: Firestore,
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const ref = db.doc(`rate_limits/${rateLimitDocId(key)}`);
  const windowMs = rule.windowSec * 1000;

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prevStart = snap.exists ? Number(snap.get('windowStart')) : NaN;
      const sameWindow = Number.isFinite(prevStart) && now - prevStart < windowMs;

      const windowStart = sameWindow ? prevStart : now;
      const prevCount = sameWindow ? Number(snap.get('count')) || 0 : 0;
      const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));

      if (prevCount >= rule.limit) {
        return { allowed: false, remaining: 0, retryAfterSec };
      }

      const count = prevCount + 1;
      tx.set(ref, {
        key,
        windowStart,
        count,
        // Marge d'une fenêtre avant purge TTL, pour rester lisible en cas d'audit.
        expiresAt: Timestamp.fromMillis(windowStart + windowMs * 2),
      }, { merge: true });

      return { allowed: true, remaining: rule.limit - count, retryAfterSec };
    });
  } catch (e) {
    console.error('[rate-limit] indisponible, requête laissée passer (fail-open)', key, e);
    return { allowed: true, remaining: rule.limit, retryAfterSec: 0 };
  }
}

/**
 * IP de l'appelant. On lit la DERNIÈRE entrée de `X-Forwarded-For`, pas la première : les
 * entrées de gauche sont fournies par le client et donc falsifiables (un attaquant se donnerait
 * une IP neuve à chaque requête pour échapper au compteur), alors que la dernière est celle
 * qu'ajoute le frontal Google devant Cloud Run.
 */
export function clientIp(req: { header(name: string): string | undefined; ip?: string }): string {
  const xff = req.header('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return req.ip || 'unknown';
}

/** Un ID de document Firestore ne peut pas contenir « / » ni être encadré de « __ ». */
function rateLimitDocId(key: string): string {
  return key.replace(/[^A-Za-z0-9_.:-]/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}
