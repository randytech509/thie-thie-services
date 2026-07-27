import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { creditWallet } from './transactions';
import { htgToCents } from './money';
import { ParsedSms } from './sms';
import { localDepositBlockedByKyc } from './kyc-deposit-guard';

/**
 * Rapproche un SMS de paiement d'une demande de dépôt en attente et auto-crédite (invariant 3).
 *
 * SÉCURITÉ / conservatisme : on ne crédite AUTOMATIQUEMENT que si l'on trouve
 * EXACTEMENT UNE `wallet_request` en attente qui concorde à la fois sur le **txId**
 * ET le **montant**. Tout le reste (aucune correspondance, ambiguë, txId manquant) →
 * NON crédité, rangé dans `sms_inbox` pour rapprochement manuel par l'admin.
 *
 * Idempotence : le crédit utilise `requestId` comme clé (comme `reviewDeposit`) → un même
 * dépôt ne peut être crédité deux fois (SMS rejoué, ou admin qui approuve aussi).
 *
 * POURQUOI SEUL LE txId AUTO-CRÉDITE (audit 2026-07-20)
 * ----------------------------------------------------
 * Les deux clés de rapprochement n'ont PAS la même valeur de preuve :
 *
 *   - `transactionReference` (txId) doit être égal à l'identifiant présent dans le SMS du
 *     MARCHAND. Le client le saisit, mais il ne peut pas le deviner : c'est l'identifiant
 *     d'une transaction qui n'a pas encore eu lieu. Le concordance vaut donc preuve.
 *
 *   - `senderPhone` est une simple DÉCLARATION du client, bornée à 15 caractères par les
 *     règles, sans aucune preuve de possession du numéro. S'en servir pour créditer revient
 *     à laisser n'importe qui revendiquer le paiement d'un tiers : il suffit de déposer une
 *     demande au numéro de la victime et au bon montant, puis d'attendre qu'elle paie. Si
 *     elle n'a pas encore créé sa propre demande, l'attaquant est le seul candidat et
 *     l'argent part chez lui.
 *
 * C'est exactement la fraude décrite au §2 de docs/BINANCE-DEPOTS.md — « il n'y a plus
 * d'identifiant d'expéditeur à revendiquer » y est présenté comme l'avantage décisif de
 * CCPayment. Le repli par numéro rouvrait ce trou sur le rail MonCash/NatCash.
 *
 * Le repli n'est pas supprimé pour autant : le TransCode saisi par le client diffère
 * légitimement de celui du marchand, et sans lui ces dépôts ne seraient plus rapprochés du
 * tout. Il devient une SUGGESTION posée sur la demande, que l'admin confirme d'un clic via
 * `reviewDeposit` — le travail de rapprochement reste fait, seule la décision de créditer
 * repose désormais sur un humain.
 */
export interface ReconcileResult {
  matched: boolean;
  credited: boolean;
  requestId?: string;
  reason?: string;
  deduped?: boolean;
  /** Rapprochement trouvé mais NON crédité : attend la confirmation d'un admin. */
  needsReview?: boolean;
}

function reqAmountCents(data: FirebaseFirestore.DocumentData): number | null {
  if (typeof data.expectedAmountCentimes === 'number') return data.expectedAmountCentimes;
  if (data.amount != null && Number.isFinite(Number(data.amount))) return htgToCents(Number(data.amount));
  return null;
}

/** Normalise un numéro de téléphone en chiffres, 8 derniers (numéros haïtiens). */
function normPhone(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '').slice(-8);
}

export async function reconcileSms(db: Firestore, parsed: ParsedSms): Promise<ReconcileResult> {
  // SÉCURITÉ : ne créditer QUE les SMS d'argent REÇU. « transferred / retiré » (sortant) et
  // le bruit (promo, OTP) ne doivent jamais créditer un wallet.
  if (parsed.direction !== 'in') {
    return { matched: false, credited: false, reason: `sms non-entrant (${parsed.direction})` };
  }
  // Le montant est INDISPENSABLE (jamais de crédit sans montant concordant). Le txId OU le
  // numéro expéditeur sert de clé de rapprochement.
  if (parsed.amountCents == null) {
    return { matched: false, credited: false, reason: 'sms-incomplet (montant manquant)' };
  }
  if (!parsed.txId && !parsed.sender) {
    return { matched: false, credited: false, reason: 'sms-incomplet (ni txId ni expéditeur)' };
  }

  const snap = await db
    .collection('wallet_requests')
    .where('paymentMethod', '==', parsed.provider)
    .where('status', '==', 'Pending Verification')
    .get();

  const amountMatch = (data: FirebaseFirestore.DocumentData) => reqAmountCents(data) === parsed.amountCents;

  // 1) PRIMAIRE : Transaction ID + montant (le TransCode saisi par le client == celui du SMS marchand).
  let candidates = parsed.txId
    ? snap.docs.filter((d) => {
        const data = d.data();
        const ref = String(data.transactionReference ?? '').toUpperCase().trim();
        return ref && ref === String(parsed.txId).toUpperCase().trim() && amountMatch(data);
      })
    : [];
  let matchBy = 'txId';

  // 2) REPLI : numéro de l'expéditeur + montant (si le TxID ne concorde pas — le TransCode peut
  //    différer entre le SMS du client et celui du marchand). Le Nom sert de vérification/affichage.
  if (candidates.length === 0 && parsed.sender) {
    const smsPhone = normPhone(parsed.sender);
    if (smsPhone.length >= 6) {
      candidates = snap.docs.filter((d) => {
        const data = d.data();
        return normPhone(data.senderPhone) === smsPhone && amountMatch(data);
      });
      matchBy = 'senderPhone';
    }
  }

  if (candidates.length === 0) return { matched: false, credited: false, reason: 'aucune demande concordante' };
  if (candidates.length > 1) return { matched: false, credited: false, reason: `correspondance ambiguë (plusieurs demandes, par ${matchBy})` };

  const doc = candidates[0];
  const data = doc.data();
  const requestId = doc.id;
  const uid = data.uid as string;

  // Rapprochement par NUMÉRO : on s'arrête ici. Le numéro est déclaré par le client, il ne
  // prouve rien (cf. en-tête). On dépose la suggestion sur la demande et l'admin tranche.
  if (matchBy === 'senderPhone') {
    await doc.ref.update({
      suggestedMatch: {
        by: 'senderPhone',
        smsTxId: parsed.txId ?? null,
        smsSender: parsed.sender ?? null,
        smsSenderName: parsed.senderName ?? null,
        amountCents: parsed.amountCents,
        at: FieldValue.serverTimestamp(),
      },
    });
    return {
      matched: true,
      credited: false,
      needsReview: true,
      requestId,
      reason: 'rapprochement par numéro expéditeur — confirmation admin requise',
    };
  }

  // Seuil KYC cumulé (5000 HTG) sur les dépôts locaux : au-delà, on ne crédite pas sans KYC
  // approuvé. On marque la demande 'KYC Required' (l'admin la créditera via reviewDeposit une
  // fois le KYC validé) et on n'échoue pas — le crédit ne bouge simplement pas.
  if (await localDepositBlockedByKyc(db, uid, parsed.provider, parsed.amountCents)) {
    await doc.ref.update({
      status: 'KYC Required',
      kycRequired: true,
      reviewedBy: 'sms-hook',
      reviewedAt: FieldValue.serverTimestamp(),
    });
    return {
      matched: true,
      credited: false,
      needsReview: true,
      requestId,
      reason: 'KYC requis : cumul des dépôts locaux > 5000 HTG',
    };
  }

  const res = await creditWallet(db, {
    uid,
    amountCents: parsed.amountCents,
    idempotencyKey: requestId,
    type: 'deposit',
    actorUid: 'sms-hook',
    meta: { provider: parsed.provider, txId: parsed.txId, sender: parsed.sender ?? null, senderName: parsed.senderName ?? null, matchBy, source: 'sms-hook' },
  });

  await doc.ref.update({
    status: 'Completed',
    reviewedBy: 'sms-hook',
    reviewedAt: FieldValue.serverTimestamp(),
    matchedTxId: parsed.txId ?? null,
    matchedBy: matchBy,
  });

  return { matched: true, credited: true, requestId, deduped: res.deduped };
}

/**
 * Rapprochement dans le SENS INVERSE : une demande de dépôt vient d'être CRÉÉE ; on cherche un
 * SMS DÉJÀ reçu et journalisé (`sms_inbox`) qui la valide.
 *
 * POURQUOI (bug constaté en test réel le 2026-07-24) : `reconcileSms` ne s'exécute qu'à
 * l'ARRIVÉE du SMS. Si le SMS est journalisé AVANT que la demande existe — cas courant : le
 * client paie puis remplit le formulaire ensuite, ou l'on vide d'un coup un backlog de SMS —
 * il est rangé « unmatched », le téléphone reçoit un 200 et ne le renvoie plus. La demande
 * créée après n'est alors JAMAIS auto-créditée. Ce sens inverse ferme le trou : la création de
 * la demande relance le rapprochement contre les SMS déjà reçus.
 *
 * SÉCURITÉ : identique à reconcileSms — on réutilise reconcileSms, donc SEUL le txId
 * auto-crédite. Le txId provient d'un `sms_inbox` écrit exclusivement par le webhook (Admin SDK)
 * à partir d'un VRAI SMS marchand : le client ne peut pas le fabriquer. Aucune règle dupliquée,
 * aucune surface de crédit nouvelle.
 */
export async function reconcileRequestFromInbox(db: Firestore, requestId: string): Promise<ReconcileResult> {
  const reqSnap = await db.doc(`wallet_requests/${requestId}`).get();
  if (!reqSnap.exists) return { matched: false, credited: false, reason: 'demande introuvable' };
  const data = reqSnap.data()!;
  if (data.status !== 'Pending Verification') return { matched: false, credited: false, reason: `demande déjà ${data.status}` };

  const provider = data.paymentMethod;
  if (provider !== 'MonCash' && provider !== 'NatCash') return { matched: false, credited: false, reason: 'méthode non-SMS' };
  const ref = String(data.transactionReference ?? '').trim();
  if (!ref) return { matched: false, credited: false, reason: 'pas de TransCode sur la demande' };

  // Le SMS est journalisé sous l'id `${provider}_${txId}` (cf. webhooks.ts) → lookup direct O(1).
  // Repli en MAJUSCULES : le txId du SMS peut différer en casse du TransCode saisi (MonCash
  // alphanumérique). Deux `get` au plus, aucun index composite requis.
  let inboxSnap = await db.doc(`sms_inbox/${provider}_${ref}`).get();
  if (!inboxSnap.exists && ref !== ref.toUpperCase()) {
    inboxSnap = await db.doc(`sms_inbox/${provider}_${ref.toUpperCase()}`).get();
  }
  if (!inboxSnap.exists) return { matched: false, credited: false, reason: 'aucun SMS reçu pour ce txId' };

  const sms = inboxSnap.data()!;
  if (sms.status === 'credited') return { matched: true, credited: false, reason: 'SMS déjà crédité (autre demande)' };

  // On reconstruit le ParsedSms depuis le journal et on réutilise reconcileSms : il retrouvera
  // la demande fraîchement créée par txId et créditera (idempotent sur requestId). Toute la
  // logique de sécurité (sens 'in', montant concordant, ambiguïté) est celle, déjà testée, de
  // reconcileSms — on ne fait que la RE-DÉCLENCHER depuis l'autre bout.
  const parsed: ParsedSms = {
    provider,
    direction: sms.direction ?? 'other',
    amountCents: typeof sms.amountCents === 'number' ? sms.amountCents : null,
    txId: sms.txId ?? null,
    sender: sms.sender ?? null,
    senderName: sms.senderName ?? null,
    balanceCents: typeof sms.merchantBalanceCents === 'number' ? sms.merchantBalanceCents : null,
    raw: sms.raw ?? '',
  };
  const result = await reconcileSms(db, parsed);

  // reconcileSms ne touche pas `sms_inbox` (d'ordinaire c'est le webhook appelant qui le fait).
  // Ici il n'y a pas de webhook : on reflète nous-mêmes l'issue dans le journal SMS.
  if (result.credited) {
    await inboxSnap.ref.update({ status: 'credited', requestId: result.requestId ?? requestId });
  } else if (result.needsReview) {
    await inboxSnap.ref.update({ status: 'needs-review', requestId: result.requestId ?? null });
  }
  return result;
}
