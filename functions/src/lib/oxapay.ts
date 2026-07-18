import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Client OxaPay minimal (gateway crypto pour la recharge wallet, invariant KYC).
 * Doc : https://docs.oxapay.com — API v1 « Payment Invoice ».
 * Aucun KYB marchand requis côté OxaPay ; le gating KYC est une politique Thie Thie
 * appliquée AVANT l'appel (voir crypto-deposits.ts : requireKycApproved).
 */

const API_BASE = 'https://api.oxapay.com/v1';

export interface GenerateInvoiceParams {
  amount: number;          // montant en `currency` (ex: USD), décimal
  currency?: string;       // défaut 'USD'
  orderId: string;         // = requestId Thie Thie (idempotence côté OxaPay)
  callbackUrl: string;
  lifetime?: number;       // minutes, 15–2880, défaut 60
  description?: string;
}

export interface GenerateInvoiceResult {
  trackId: string;
  paymentUrl: string;
  expiredAt: number; // unix seconds
}

export class OxapayError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export async function generateInvoice(
  apiKey: string,
  p: GenerateInvoiceParams,
): Promise<GenerateInvoiceResult> {
  const res = await fetch(`${API_BASE}/payment/invoice`, {
    method: 'POST',
    headers: {
      merchant_api_key: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: p.amount,
      currency: p.currency ?? 'USD',
      order_id: p.orderId,
      callback_url: p.callbackUrl,
      lifetime: p.lifetime ?? 60,
      description: p.description,
    }),
  });

  const json = (await res.json()) as {
    data?: { track_id: string; payment_url: string; expired_at: number };
    message?: string;
    error?: unknown;
    status?: number;
  };

  if (!res.ok || !json.data) {
    throw new OxapayError(json.message ?? 'échec de création de facture OxaPay', json.status ?? res.status);
  }

  return {
    trackId: json.data.track_id,
    paymentUrl: json.data.payment_url,
    expiredAt: json.data.expired_at,
  };
}

export interface OxapayCallback {
  trackId: string;
  status: string; // 'Paying' | 'Paid' | autres
  orderId: string;
  amount: number;
  currency: string;
}

export function parseCallback(body: Record<string, unknown>): OxapayCallback {
  return {
    trackId: String(body.track_id ?? ''),
    status: String(body.status ?? ''),
    orderId: String(body.order_id ?? ''),
    amount: Number(body.amount ?? 0),
    currency: String(body.currency ?? ''),
  };
}

/**
 * Vérifie la signature HMAC-SHA512 du webhook (header `HMAC`), calculée sur le CORPS BRUT
 * de la requête avec le MERCHANT_API_KEY comme clé partagée. Comparaison en temps constant.
 */
export function verifyCallbackSignature(rawBody: Buffer | string, hmacHeader: string | undefined, apiKey: string): boolean {
  if (!hmacHeader) return false;
  const expected = createHmac('sha512', apiKey).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hmacHeader, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
