/**
 * Adaptateur Reloadly Gift Cards (fournisseur B2B, cartes cadeaux mondiales).
 * OAuth client_credentials → REST. Sandbox gratuit pour tester (crédits offerts).
 * Config (Secret Manager / functions env) :
 *   RELOADLY_CLIENT_ID, RELOADLY_CLIENT_SECRET, RELOADLY_ENV = 'sandbox' | 'live'
 * Dégradation gracieuse : si non configuré, `isConfigured()` = false → le fulfilment
 * retombe sur le mode MANUEL (admin saisit le code) — voir fulfillment/auto-fulfill.
 */
const ENV = () => (process.env.RELOADLY_ENV === 'live' ? 'live' : 'sandbox');
const AUTH_URL = 'https://auth.reloadly.com/oauth/token';
const BASE = () => (ENV() === 'live' ? 'https://giftcards.reloadly.com' : 'https://giftcards-sandbox.reloadly.com');
const AUDIENCE = () => BASE(); // Reloadly : audience == base URL de l'API
const ACCEPT = 'application/com.reloadly.giftcards-v1+json';

export function isConfigured(): boolean {
  return !!(process.env.RELOADLY_CLIENT_ID && process.env.RELOADLY_CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.RELOADLY_CLIENT_ID,
      client_secret: process.env.RELOADLY_CLIENT_SECRET,
      grant_type: 'client_credentials',
      audience: AUDIENCE(),
    }),
  });
  if (!res.ok) throw new Error(`Reloadly auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

async function api(path: string, init?: RequestInit): Promise<any> {
  const token = await getToken();
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Reloadly ${init?.method || 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return body;
}

/** Solde du compte Reloadly (prépayé). */
export function getBalance(): Promise<{ balance: number; currencyCode: string }> {
  return api('/accounts/balance');
}

/** Liste paginée des produits carte cadeau (prix, dénominations, pays, remise). */
export function getProducts(page = 1, size = 200, productName?: string): Promise<any> {
  const q = productName ? `&productName=${encodeURIComponent(productName)}` : '';
  return api(`/products?page=${page}&size=${size}${q}`);
}

export function getProduct(productId: number): Promise<any> {
  return api(`/products/${productId}`);
}

/** Passe une commande de carte cadeau. `customIdentifier` = clé d'idempotence (notre orderId). */
export function placeOrder(input: {
  productId: number;
  countryCode: string;
  quantity: number;
  unitPrice: number;         // dénomination dans la devise du produit
  customIdentifier: string;  // idempotence (ex. orderId Firestore)
  senderName: string;
  recipientEmail?: string;
}): Promise<{ transactionId: number; status: string; [k: string]: unknown }> {
  return api('/orders', { method: 'POST', body: JSON.stringify(input) });
}

/** Récupère le(s) code(s) de la carte après une commande réussie. */
export function getOrderCards(transactionId: number): Promise<any> {
  return api(`/orders/transactions/${transactionId}/cards`);
}

export function getTransaction(transactionId: number): Promise<any> {
  return api(`/reports/transactions/${transactionId}`);
}
