import crypto from 'node:crypto';

/**
 * Client GIFT ACCESS (portal.gift-access.com/api/v1) — 2e fournisseur d'auto-livraison,
 * destiné à REMPLACER la livraison manuelle des produits gaming (Free Fire top-up direct,
 * PUBG, CoD, etc.). Miroir de `lib/reloadly.ts` : dégradation gracieuse via `isConfigured()`,
 * helper `api()` unique, erreurs descriptives.
 *
 * AUTH (doc GIFT ACCESS) : message signé = `timestamp + method + path + body`,
 *   headers X-API-KEY / X-API-SIGNATURE / X-API-TIMESTAMP (+ Idempotency-Key, Content-Type sur POST),
 *   signature = HMAC-SHA256(secret, message).
 *
 * FORMULE DE SIGNATURE VALIDÉE (sonde 2026-07-26, sandbox) :
 *   message = `${ts_SECONDES}${METHOD}${/api/v1 + pathname_SANS_query}${body}`
 *   digest = HMAC-SHA256 en HEX. Le query string N'EST PAS signé (mais reste dans l'URL).
 *   (Un mauvais timestamp → 401 EXPIRED_TIMESTAMP ; le serveur veut des SECONDES, pas des ms.)
 */

const API_PREFIX = '/api/v1';
const BASE = () => (process.env.GIFTACCESS_BASE_URL || 'https://portal.gift-access.com').replace(/\/$/, '');
const ENV = () => (process.env.GIFTACCESS_ENV === 'live' ? 'live' : 'sandbox');

export function isConfigured(): boolean {
  return !!(process.env.GIFTACCESS_API_KEY && process.env.GIFTACCESS_API_SECRET);
}

function signedHeaders(method: string, endpoint: string, body: string): Record<string, string> {
  const key = process.env.GIFTACCESS_API_KEY as string;
  const secret = process.env.GIFTACCESS_API_SECRET as string;
  const ts = Math.floor(Date.now() / 1000).toString(); // SECONDES (impératif)
  const pathname = endpoint.split('?')[0];              // query exclu de la signature
  const message = `${ts}${method.toUpperCase()}${API_PREFIX}${pathname}${body}`;
  const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return {
    'X-API-KEY': key,
    'X-API-SIGNATURE': signature,
    'X-API-TIMESTAMP': ts,
    'Content-Type': 'application/json',
  };
}

/**
 * Appel signé unique. `endpoint` est RELATIF au préfixe /api/v1 (ex: '/orders').
 * `idempotencyKey` ajoute l'en-tête Idempotency-Key (requis par GIFT ACCESS sur les créations).
 */
async function api(
  method: string,
  endpoint: string,
  opts?: { body?: unknown; idempotencyKey?: string },
): Promise<any> {
  const bodyStr = opts?.body != null ? JSON.stringify(opts.body) : '';
  const headers = signedHeaders(method, endpoint, bodyStr);
  if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const res = await fetch(`${BASE()}${API_PREFIX}${endpoint}`, {
    method,
    headers,
    body: bodyStr || undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GiftAccess ${method} ${endpoint} → ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

// --- Endpoints ------------------------------------------------------------------

/** Sanity check : la clé répond. */
export function ping(): Promise<any> {
  return api('GET', '/ping');
}

/** Solde du wallet USD prépayé (pour l'alerte solde bas du back-office). */
export function walletBalance(): Promise<any> {
  return api('GET', '/wallet/balance');
}

/** Liste des produits (avec API Product IDs + variations) — pour l'import catalogue. */
export function listProducts(query?: Record<string, string | number>): Promise<any> {
  const qs = query
    ? '?' + Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  return api('GET', `/products${qs}`);
}

/** Détail d'un produit / d'une variation (champs requis pour commander). */
export function getProduct(productId: string): Promise<any> {
  return api('GET', `/products/${encodeURIComponent(productId)}`);
}

/**
 * Vérifie un player User ID avant de débiter (top-up direct : Free Fire, etc.).
 * ⚠️ TODO(sonde) : forme d'endpoint à confirmer (ex. POST /orders/validate ou /products/{id}/validate).
 */
export function validatePlayer(input: { productId: string; userId: string; variationId?: string }): Promise<any> {
  return api('POST', '/orders/validate', { body: input });
}

/**
 * Crée une commande (top-up direct par userId, ou carte/PIN selon le produit).
 * `idempotencyKey` = l'ID de commande thie-thie → retries sûrs, pas de double-débit.
 */
export function createOrder(input: {
  productId: string;
  variationId?: string | null; // valeur envoyée dans `variation_ref`
  amount?: number | null; // produits 'range' (Google Play/Roblox/PlayStation)
  userId?: string; // requis pour les top-up directs (Free Fire/PUBG) → fields.userid
  quantity?: number;
  reference?: string; // référence marchand (requise) ; défaut = idempotencyKey
  idempotencyKey: string;
}): Promise<any> {
  // Body VALIDÉ par commande test sandbox (201) :
  //   { product_id, quantity, reference, variation_ref?, amount?, fields:{ userid }? }
  const body: Record<string, unknown> = {
    product_id: input.productId,
    quantity: input.quantity ?? 1,
    reference: input.reference ?? input.idempotencyKey,
  };
  if (input.variationId) body.variation_ref = input.variationId;
  if (input.amount != null) body.amount = input.amount;
  if (input.userId) body.fields = { userid: input.userId };
  return api('POST', '/orders', { body, idempotencyKey: input.idempotencyKey });
}

/** État d'une commande (pour le polling : pending → delivered/failed). */
export function getOrder(orderId: string): Promise<any> {
  return api('GET', `/orders/${encodeURIComponent(orderId)}`);
}

export { ENV };
