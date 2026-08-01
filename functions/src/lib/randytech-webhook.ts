import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Vérification du contrat « RandyTech SMS Webhook » — l'app marchande (produit RandyTech
 * Solutions, package `com.randytech.smswebhook`) signe chaque SMS transféré :
 *   - `X-RandyTech-Timestamp` : secondes Unix ;
 *   - `X-RandyTech-Signature` : `sha256=` + hex(HMAC-SHA256(secret, `${ts}.${corps_brut}`)).
 * Le secret ne circule JAMAIS sur le réseau — c'est tout l'intérêt face à l'ancien chemin
 * « secret dans le corps », qui exposait la valeur à chaque envoi et à chaque log intermédiaire.
 *
 * La signature porte sur les OCTETS BRUTS reçus : re-sérialiser `req.body` avant de vérifier
 * casserait la comparaison au premier écart de formatage (ordre des clés, échappement Unicode),
 * et surtout ferait vérifier autre chose que ce qui a été signé.
 *
 * Contrat de référence : `~/dev/thie-thie-sms-forwarder/docs/webhook-integration.md`.
 */

/** Fenêtre anti-rejeu, en secondes (±5 min), identique au récepteur de référence. */
export const MAX_SKEW_SECONDS = 5 * 60;

export type SignatureVerdict =
  | { ok: true }
  | { ok: false; reason: 'absent' | 'horodatage' | 'signature' };

/**
 * `absent` distingue « cette requête n'utilise pas ce chemin d'auth » (aucun en-tête) d'un
 * échec réel : l'appelant peut ainsi essayer un autre moyen d'authentification sans compter
 * une tentative ratée au quota anti-brute-force.
 */
export function verifyRandytechSignature(
  rawBody: Buffer | string,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): SignatureVerdict {
  if (!timestampHeader && !signatureHeader) return { ok: false, reason: 'absent' };
  if (!timestampHeader || !signatureHeader) return { ok: false, reason: 'signature' };

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'horodatage' };
  }

  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(`${timestampHeader}.`)
    .update(body)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return { ok: false, reason: 'signature' };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'signature' };
}
