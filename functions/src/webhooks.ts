import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { timingSafeEqual } from 'node:crypto';
import { parseSms, SmsProvider } from './lib/sms';
import { reconcileSms } from './lib/deposit-reconcile';
import { parseCallback, verifyCallbackSignature } from './lib/oxapay';
import { verifyRandytechSignature } from './lib/randytech-webhook';
import { reconcileOxapayCallback } from './lib/oxapay-reconcile';
import { DomainError } from './lib/transactions';
import { audit } from './lib/audit';
import {
  clientIp, consumeRateLimit, WEBHOOK_IP_RULE, WEBHOOK_AUTH_FAIL_RULE, RateLimitRule,
} from './lib/rate-limit';

/**
 * « SMS hook » MonCash / NatCash : une app sur le téléphone marchand lit le SMS de confirmation
 * entrant et le POST ici. On parse → journalise (`sms_inbox`) → tente un rapprochement auto
 * (crédit idempotent via `creditWallet`) ; sinon on laisse en attente de rapprochement manuel.
 *
 * SÉCURITÉ : endpoint public → trois moyens d'authentification acceptés pendant la migration :
 *   1. `Authorization: Bearer <idToken Firebase>` avec le claim `smsForwarder` — HÉRITÉ (ancienne
 *      app `com.thiethieservices.smsforwarder`) ;
 *   2. signature HMAC `X-RandyTech-Signature` / `X-RandyTech-Timestamp` — PRÉFÉRÉ, c'est le
 *      contrat de l'app produit « RandyTech SMS Webhook » (cf. `lib/randytech-webhook.ts`) ;
 *   3. secret partagé `SMS_HOOK_SECRET` dans le corps — HÉRITÉ, à retirer une fois les
 *      appareils migrés.
 * L'authentification dit QUI peut soumettre, jamais si le SMS est VRAI : c'est le
 * rapprochement strict (txId + montant + sens `in`) qui protège l'argent. Ne JAMAIS créditer
 * sur un SMS non concordant, quel que soit le porteur.
 * Rate-limit par IP (flood) + compteur strict sur les secrets erronés (brute-force) — cf.
 * `lib/rate-limit.ts`. Le limiteur est fail-open : il ne doit jamais bloquer un vrai dépôt.
 *
 * Corps attendu (JSON) : { provider: 'MonCash'|'NatCash', text: '<SMS brut>', from?: '<n°>',
 *                          messageId?, timestamp?, deviceId?, secret? } — `secret` inutile si
 * un jeton Bearer ou une signature RandyTech est fourni. `messageId` sert de clé d'idempotence
 * quand le SMS ne porte pas de txId exploitable.
 */
export const ingestSms = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST requis' }); return; }

  const db = getFirestore();
  const ip = clientIp(req);
  if (await rejectIfRateLimited(db, res, `sms:ip:${ip}`, WEBHOOK_IP_RULE)) return;

  const body = (typeof req.body === 'string' ? safeJson(req.body) : req.body) ?? {};

  // --- Authentification : jeton Firebase (préféré) OU secret partagé (hérité) -------------
  // Les DEUX sont acceptés pendant la migration. Une bascule brutale exigerait de mettre à
  // jour le téléphone à la seconde près, sous peine d'interrompre les dépôts — c'est
  // exactement ce qui s'est produit lors de la rotation du secret. Le secret partagé sera
  // retiré une fois tous les appareils passés au jeton.
  //
  // Le jeton est PRÉFÉRABLE : durée de vie d'une heure, renouvelé seul, révocable par
  // appareil en désactivant le compte — là où le secret impose une manipulation physique.
  let submitter = 'unknown';
  let authOk = false;

  const bearer = req.header('authorization');
  if (bearer?.startsWith('Bearer ')) {
    try {
      const decoded = await getAuth().verifyIdToken(bearer.slice(7).trim());
      // Le claim dédié est indispensable : un compte client valide ne doit PAS pouvoir
      // injecter de SMS de dépôt sous prétexte qu'il est authentifié.
      if (decoded.smsForwarder === true) {
        authOk = true;
        submitter = `uid:${decoded.uid}`;
      }
    } catch {
      /* jeton absent, expiré ou falsifié : on retombe sur le secret partagé */
    }
  }

  // Signature HMAC de l'app produit « RandyTech SMS Webhook ». Vérifiée sur le CORPS BRUT
  // (`req.rawBody`, fourni par Cloud Functions) : c'est sur ces octets exacts que l'app a
  // signé, un `JSON.stringify(req.body)` reconstruit ne correspondrait pas.
  const signingSecret = process.env.RANDYTECH_SIGNING_SECRET;
  if (!authOk && signingSecret) {
    const verdict = verifyRandytechSignature(
      req.rawBody ?? '',
      req.header('x-randytech-timestamp'),
      req.header('x-randytech-signature'),
      signingSecret,
    );
    if (verdict.ok) {
      authOk = true;
      // Traçabilité par appareil — ce que le secret partagé, anonyme par nature, ne permet pas.
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId : 'inconnu';
      submitter = `device:${deviceId}`;
    } else if (verdict.reason !== 'absent') {
      // En-têtes présents mais invalides : l'émetteur PRÉTEND être l'app. Inutile de retomber
      // sur les autres chemins, et le refus est explicite pour que le journal de l'app affiche
      // la vraie cause (403 horodatage vs 401 signature) plutôt qu'un « auth refusée » opaque.
      if (await rejectIfRateLimited(db, res, `sms:authfail:${ip}`, WEBHOOK_AUTH_FAIL_RULE)) return;
      if (verdict.reason === 'horodatage') {
        res.status(403).json({ ok: false, error: 'timestamp hors fenêtre' }); return;
      }
      res.status(401).json({ ok: false, error: 'signature invalide' }); return;
    }
  }

  const secret = process.env.SMS_HOOK_SECRET;
  if (!authOk) {
    if (!secret && !signingSecret) { res.status(503).json({ ok: false, error: 'aucun moyen d’authentification configuré' }); return; }
    if (secret && typeof body.secret === 'string' && safeEqualSecret(body.secret, secret)) {
      authOk = true;
      submitter = 'secret-partage';
    }
  }

  if (!authOk) {
    // Un échec consomme le quota dédié : 10 essais / 15 min et par IP.
    if (await rejectIfRateLimited(db, res, `sms:authfail:${ip}`, WEBHOOK_AUTH_FAIL_RULE)) return;
    res.status(401).json({ ok: false, error: 'authentification refusée' }); return;
  }

  const provider = body.provider as SmsProvider;
  if (provider !== 'MonCash' && provider !== 'NatCash') {
    res.status(400).json({ ok: false, error: "provider doit être 'MonCash' ou 'NatCash'" }); return;
  }
  const rawText = String(body.text ?? body.message ?? '');
  if (!rawText.trim()) { res.status(400).json({ ok: false, error: 'text (SMS) manquant' }); return; }

  const parsed = parseSms(provider, rawText);

  // Journal / idempotence du SMS : clé = txId si dispo, sinon `messageId` de l'app.
  // Sans txId, une clé horodatée créait un document NEUF à chaque tentative — or l'app réessaie
  // jusqu'à six fois avec le même `messageId` : le même SMS se retrouvait journalisé six fois.
  // `messageId` est stable d'une reprise à l'autre, c'est la clé d'idempotence prévue par le
  // contrat. Repli sur l'horodatage pour les émetteurs qui ne l'envoient pas (ancienne app).
  const messageId = typeof body.messageId === 'string' && body.messageId.trim()
    ? body.messageId.trim().replace(/\//g, '_') // un '/' couperait le chemin du document
    : null;
  const inboxId = parsed.txId
    ? `${provider}_${parsed.txId}`
    : messageId ? `${provider}_msg_${messageId}` : `${provider}_${Date.now()}`;
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
    // Sens non reconnu MAIS txId fort + montant : c'est une transaction, pas du bruit. On la
    // remonte « à rapprocher » — rangée dans les ignorés, elle se noyait parmi les OTP et un
    // vrai dépôt a dû être validé à la main (cas constaté le 2026-07-29, « reC§u » abîmé).
    : parsed.suspectUnclassified ? 'needs-review'
    : parsed.direction !== 'in' ? `ignored-${parsed.direction}`
    // Rapproché par numéro expéditeur : une demande concorde, mais le numéro est déclaré par
    // le client et ne prouve rien — l'admin confirme. À distinguer de 'unmatched', sinon la
    // suggestion se noie parmi les SMS sans correspondance et personne ne la traite.
    : result.needsReview ? 'needs-review'
    : 'unmatched';

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
    // Qui a soumis : le registre disait quoi, jamais qui.
    submittedBy: submitter,
    messageId,
    deviceId: typeof body.deviceId === 'string' ? body.deviceId : null,
    status,
    suspectUnclassified: parsed.suspectUnclassified ?? false,
    requestId: result.requestId ?? null,
    reason: parsed.suspectUnclassified
      ? 'sens non reconnu — dépôt possible'
      : result.reason ?? null,
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
 * Rate-limit par IP + compteur strict sur les signatures invalides (cf. `lib/rate-limit.ts`).
 * Un 429 sur un vrai callback n'est pas une perte : OxaPay réessaie et le crédit est idempotent.
 */
export const ingestOxapayCallback = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST requis' }); return; }

  const db = getFirestore();
  const ip = clientIp(req);
  if (await rejectIfRateLimited(db, res, `oxapay:ip:${ip}`, WEBHOOK_IP_RULE)) return;

  const apiKey = process.env.OXAPAY_MERCHANT_API_KEY;
  if (!apiKey) { res.status(503).json({ ok: false, error: 'OXAPAY_MERCHANT_API_KEY non configuré' }); return; }

  const rawBody: Buffer | string = (req as unknown as { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body ?? {});
  const signature = req.header('HMAC');
  if (!verifyCallbackSignature(rawBody, signature, apiKey)) {
    if (await rejectIfRateLimited(db, res, `oxapay:authfail:${ip}`, WEBHOOK_AUTH_FAIL_RULE)) return;
    res.status(401).json({ ok: false, error: 'signature HMAC invalide' }); return;
  }

  const body = (typeof req.body === 'string' ? safeJson(req.body) : req.body) ?? {};
  const cb = parseCallback(body as Record<string, unknown>);

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

/**
 * Consomme un jeton et, si la fenêtre est saturée, répond 429 + `Retry-After`.
 * Renvoie `true` quand la réponse a déjà été envoyée — l'appelant doit alors sortir.
 */
async function rejectIfRateLimited(
  db: Firestore,
  res: { status(c: number): { json(b: unknown): void }; set(k: string, v: string): void },
  key: string,
  rule: RateLimitRule,
): Promise<boolean> {
  const verdict = await consumeRateLimit(db, key, rule);
  if (verdict.allowed) return false;
  res.set('Retry-After', String(verdict.retryAfterSec));
  res.status(429).json({ ok: false, error: 'trop de requêtes' });
  return true;
}

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
