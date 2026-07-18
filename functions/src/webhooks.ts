import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';
import { parseSms, SmsProvider } from './lib/sms';
import { reconcileSms } from './lib/deposit-reconcile';
import { parseCallback, verifyCallbackSignature } from './lib/oxapay';
import { reconcileOxapayCallback } from './lib/oxapay-reconcile';
import { DomainError } from './lib/transactions';
import { audit } from './lib/audit';

/**
 * « SMS hook » MonCash / NatCash : une app sur le téléphone marchand lit le SMS de confirmation
 * entrant et le POST ici. On parse → journalise (`sms_inbox`) → tente un rapprochement auto
 * (crédit idempotent via `creditWallet`) ; sinon on laisse en attente de rapprochement manuel.
 *
 * SÉCURITÉ : endpoint public → protégé par un secret partagé `SMS_HOOK_SECRET` (Secret Manager).
 * Pas d'App Check possible sur un onRequest ; le secret + le rapprochement strict (txId+montant)
 * limitent les abus. Ne JAMAIS créditer sur un SMS non concordant.
 *
 * Corps attendu (JSON) : { secret, provider: 'MonCash'|'NatCash', text: '<SMS brut>', from?: '<n°>' }
 */
export const ingestSms = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST requis' }); return; }

  const secret = process.env.SMS_HOOK_SECRET;
  if (!secret) { res.status(503).json({ ok: false, error: 'SMS_HOOK_SECRET non configuré' }); return; }

  const body = (typeof req.body === 'string' ? safeJson(req.body) : req.body) ?? {};
  if (typeof body.secret !== 'string' || !safeEqualSecret(body.secret, secret)) {
    res.status(401).json({ ok: false, error: 'secret invalide' }); return;
  }

  const provider = body.provider as SmsProvider;
  if (provider !== 'MonCash' && provider !== 'NatCash') {
    res.status(400).json({ ok: false, error: "provider doit être 'MonCash' ou 'NatCash'" }); return;
  }
  const rawText = String(body.text ?? body.message ?? '');
  if (!rawText.trim()) { res.status(400).json({ ok: false, error: 'text (SMS) manquant' }); return; }

  const db = getFirestore();
  const parsed = parseSms(provider, rawText);

  // Journal / idempotence du SMS : clé = txId si dispo, sinon horodatage.
  const inboxId = parsed.txId ? `${provider}_${parsed.txId}` : `${provider}_${Date.now()}`;
  const inboxRef = db.doc(`sms_inbox/${inboxId}`);
  const existing = await inboxRef.get();
  if (existing.exists && existing.get('status') === 'credited') {
    res.json({ ok: true, alreadyProcessed: true, requestId: existing.get('requestId') ?? null }); return;
  }

  let result;
  try {
    result = await reconcileSms(db, parsed);
  } catch (e) {
    result = { matched: false, credited: false, reason: 'erreur: ' + e };
  }

  // Registre de TOUTES les transactions lues (entrantes/sortantes/bruit) pour rapprochement
  // manuel et suivi des balances. Seuls les 'in' concordants sont auto-crédités.
  const status = result.credited
    ? 'credited'
    : parsed.direction !== 'in' ? `ignored-${parsed.direction}` : 'unmatched';

  await inboxRef.set({
    provider,
    direction: parsed.direction,
    amountCents: parsed.amountCents ?? null,
    txId: parsed.txId ?? null,
    sender: parsed.sender ?? null,
    senderName: parsed.senderName ?? null,
    merchantBalanceCents: parsed.balanceCents ?? null,
    raw: parsed.raw,
    from: body.from ?? null,
    status,
    requestId: result.requestId ?? null,
    reason: result.reason ?? null,
    receivedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (result.credited) {
    await audit(db, {
      action: 'sms-hook:credit', actorUid: 'sms-hook', targetUid: undefined,
      amountCents: parsed.amountCents ?? undefined,
      meta: { provider, txId: parsed.txId, requestId: result.requestId },
    });
  }

  res.json({ ok: true, ...result });
});

/**
 * Webhook OxaPay : callback signé sur paiement d'une facture crypto (recharge wallet).
 *
 * SÉCURITÉ : endpoint public → signature HMAC-SHA512 obligatoire (header `HMAC`, calculée par
 * OxaPay sur le corps BRUT avec OXAPAY_MERCHANT_API_KEY comme secret partagé). Requête non
 * signée ou signature invalide → rejetée sans effet. Ne créditer QUE sur status 'Paid'
 * (invariant 3, comme reconcileSms : jamais de crédit sur un statut intermédiaire/ambigu).
 * Idempotent via creditWallet(idempotencyKey=requestId) — un même paiement (retries OxaPay,
 * webhook rejoué) ne peut créditer deux fois.
 */
export const ingestOxapayCallback = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST requis' }); return; }

  const apiKey = process.env.OXAPAY_MERCHANT_API_KEY;
  if (!apiKey) { res.status(503).json({ ok: false, error: 'OXAPAY_MERCHANT_API_KEY non configuré' }); return; }

  const rawBody: Buffer | string = (req as unknown as { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body ?? {});
  const signature = req.header('HMAC');
  if (!verifyCallbackSignature(rawBody, signature, apiKey)) {
    res.status(401).json({ ok: false, error: 'signature HMAC invalide' }); return;
  }

  const body = (typeof req.body === 'string' ? safeJson(req.body) : req.body) ?? {};
  const cb = parseCallback(body as Record<string, unknown>);

  const db = getFirestore();
  try {
    const result = await reconcileOxapayCallback(db, cb);
    if (result.credited) {
      await audit(db, {
        action: 'oxapay-webhook:credit', actorUid: 'oxapay-webhook',
        meta: { trackId: cb.trackId, requestId: result.requestId },
      });
    }
    if (!result.matched) { res.status(404).json({ ok: false, ...result }); return; }
    res.json({ ok: true, ...result });
  } catch (e) {
    const reason = e instanceof DomainError ? e.message : String(e);
    res.status(500).json({ ok: false, error: reason });
  }
});

function safeJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s); } catch { return null; }
}

/** Comparaison à temps constant — évite qu'un attaquant déduise le secret octet par octet
 *  en mesurant les micro-différences de latence d'un `!==` classique (fuite de timing). */
function safeEqualSecret(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
