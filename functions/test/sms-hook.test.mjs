// Tests du « SMS hook » MonCash/NatCash : parsing + rapprochement + auto-crédit idempotent.
// Exécuter après build ; via l'émulateur Firestore (npm run test:functions).
import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHmac } from 'node:crypto';
import { parseSms, parseHtgAmountToCents } from '../lib/lib/sms.js';
import { reconcileSms, reconcileRequestFromInbox } from '../lib/lib/deposit-reconcile.js';
import { verifyRandytechSignature, MAX_SKEW_SECONDS } from '../lib/lib/randytech-webhook.js';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const app = initializeApp({ projectId: 'thie-thie-sms-test' }, 'sms');
const db = getFirestore(app);
const UID = 'userSMS';

async function clearAll() {
  for (const c of ['users', 'wallet_requests', 'wallet_transactions', 'sms_inbox', 'admin_audit']) {
    await db.recursiveDelete(db.collection(c));
  }
}
beforeEach(clearAll);
after(clearAll);

describe('parseSms', () => {
  test('extrait montant (centimes), txId et expéditeur', () => {
    const p = parseSms('MonCash', 'Ou resevwa 1,500.00 HTG nan men 3712 3456. Tranzaksyon: AB12CD34. Mèsi.');
    assert.equal(p.amountCents, 150000);
    assert.equal(p.txId, 'AB12CD34');
    assert.equal(p.sender, '37123456');
  });
  test('montants variés → centimes', () => {
    assert.equal(parseHtgAmountToCents('500 HTG'), 50000);
    assert.equal(parseHtgAmountToCents('1 000,50 Gourdes'), 100050);
    assert.equal(parseHtgAmountToCents('2,000.00 HTG'), 200000);
  });

  test('format réel MonCash (G devant, Txn ID) — données anonymisées', () => {
    const p = parseSms('MonCash', 'You have received G1,100.00 with MonCash from 50900000000 . Txn ID: 000000000001');
    assert.equal(p.amountCents, 110000);
    assert.equal(p.txId, '000000000001');
  });

  test('format réel NatCash sortie (montant milliers, TransCode, prend le montant pas les frais)', () => {
    const p = parseSms('NatCash', 'Vous avez retire 1,500 HTG du 000000 - SPECIMEN TEST a 19:27 01/07/2026. Frais: 45.5 HTG. TransCode: 00000000000002. Merci');
    assert.equal(p.amountCents, 150000); // 1,500 HTG, PAS 45.5 (frais)
    assert.equal(p.txId, '00000000000002');
  });

  test('format réel NatCash RÉCEPTION (ignore le solde, garde le montant reçu)', () => {
    const p = parseSms('NatCash', 'Vous avez recu 1,500 HTG de SPECIMEN TEST 40000000 a 15:20 01/07/2026, contenu: Ok. Votre solde: 1,000.00 HTG. TransCode: 00000000000003. Merci');
    assert.equal(p.amountCents, 150000);       // 1,500 reçu, PAS 1,000.00 (solde)
    assert.equal(p.txId, '00000000000003');
    assert.equal(p.sender, '40000000');
  });

  test('format réel NatCash en créole (« nan » au lieu de « de » pour le nom expéditeur, « Balans ou: » pour le solde)', () => {
    const p = parseSms('NatCash', 'Ou resevwa 10 HTG nan SPESIMEN TEST 00000000 nan 16:37 16/07/2026, kontni: ok. Balans ou: 1,908.25 HTG. Transcode: 00000000000001. Mesi');
    assert.equal(p.direction, 'in');
    assert.equal(p.amountCents, 1000);
    assert.equal(p.txId, '00000000000001');
    assert.equal(p.sender, '00000000');
    assert.equal(p.senderName, 'SPESIMEN TEST');
    assert.equal(p.balanceCents, 190825);
  });
});

describe('sens de transaction & bruit (format NatCash réel, données anonymisées)', () => {
  test('reçu → in (+ nom + solde marchand)', () => {
    const p = parseSms('NatCash', 'Vous avez recu 495 HTG de SPECIMEN TEST 40000000 a 17:11 30/06/2026, contenu: ok. Votre solde: 5,000.00 HTG. TransCode: 00000000000004. Merci');
    assert.equal(p.direction, 'in');
    assert.equal(p.amountCents, 49500);
    assert.equal(p.txId, '00000000000004');
    assert.equal(p.senderName, 'SPECIMEN TEST');
    assert.equal(p.merchantBalanceCents ?? p.balanceCents, 500000);
  });
  test('transferred → out (ne doit pas créditer)', () => {
    const p = parseSms('NatCash', 'You transferred 13,500 HTG to SPECIMEN TEST 40000000 at 17:36 30/06/2026, fee: 63 HTG. Your balance: 1,000.00 HTG. TransCode: 00000000000005. Thank you');
    assert.equal(p.direction, 'out');
    assert.equal(p.amountCents, 1350000);
  });
  test('promo / OTP → other', () => {
    assert.equal(parseSms('NatCash', 'A 5:00 PM, France vs Sweden nan 16e Final! Rechaje kont ParyajLakay. *Fe 202# chwazi 4').direction, 'other');
    assert.equal(parseSms('NatCash', 'OTP is 000000. Please DO NOT provide OTP for anyone.').direction, 'other');
  });

  test('DÉPÔT AGENT « encaisse » → in, et prend le TransCode PAS le code agent court', () => {
    // Deux identifiants coexistent : « code 347386 » (agent, court/devinable) et « TransCode:
    // 26072343604240 » (long). L'auto-crédit ne doit jamais s'appuyer sur le code agent.
    const p = parseSms('NatCash', 'Vous avez encaisse 2,000 HTG a 12:45 23/07/2026 de SPECIMEN TEST, code 347386. Votre solde: 27,194.12 HTG. TransCode: 26072343604240. Merci');
    assert.equal(p.direction, 'in');
    assert.equal(p.amountCents, 200000);   // 2,000 HTG, PAS le solde 27,194.12
    assert.equal(p.txId, '26072343604240'); // le TransCode, PAS 347386
  });

  test('encaissé (accent) → in aussi', () => {
    assert.equal(parseSms('NatCash', 'Vous avez encaissé 500 HTG de SPECIMEN TEST, code 111111. TransCode: 99999999999999. Merci').direction, 'in');
  });

  test('SÉCURITÉ : un SMS n’ayant QU’un code agent court ne fournit pas de txId fort → pas d’auto-crédit', () => {
    // Pas de TransCode/transaction/référence : « code » nu reste un dernier recours, mais ce SMS
    // (notification d'enregistrement, pas un dépôt) ne doit pas produire de clé exploitable.
    const p = parseSms('NatCash', 'Le 33146025 a enregistre PAP699 avec succes pour vous via NatCash a 08:18 24/07/2026.');
    assert.equal(p.txId, null);
  });
});

describe('signature RandyTech (app « RandyTech SMS Webhook »)', () => {
  const SECRET = 'secret-de-signature-de-test';
  const NOW = 1_800_000_000;
  const BODY = JSON.stringify({
    provider: 'MonCash', text: 'Ou resevwa 1,500.00 HTG. Tranzaksyon: AB12CD34',
    from: 'Mon Cash', messageId: 'a1b2', timestamp: NOW, deviceId: 'device-test',
  });
  const sign = (ts, body, secret = SECRET) =>
    'sha256=' + createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

  test('signature valide → acceptée', () => {
    const v = verifyRandytechSignature(BODY, String(NOW), sign(NOW, BODY), SECRET, NOW);
    assert.equal(v.ok, true);
  });

  test('même signature calculée sur un Buffer (corps brut Cloud Functions) → acceptée', () => {
    const v = verifyRandytechSignature(Buffer.from(BODY, 'utf8'), String(NOW), sign(NOW, BODY), SECRET, NOW);
    assert.equal(v.ok, true);
  });

  test('mauvais secret → refus « signature »', () => {
    const v = verifyRandytechSignature(BODY, String(NOW), sign(NOW, BODY, 'autre-secret'), SECRET, NOW);
    assert.deepEqual(v, { ok: false, reason: 'signature' });
  });

  test('corps modifié après signature → refus', () => {
    const sig = sign(NOW, BODY);
    const falsifie = BODY.replace('1,500.00', '9,500.00');
    assert.deepEqual(verifyRandytechSignature(falsifie, String(NOW), sig, SECRET, NOW),
      { ok: false, reason: 'signature' });
  });

  test('horodatage périmé → refus « horodatage » (anti-rejeu)', () => {
    const vieux = NOW - MAX_SKEW_SECONDS - 1;
    const v = verifyRandytechSignature(BODY, String(vieux), sign(vieux, BODY), SECRET, NOW);
    assert.deepEqual(v, { ok: false, reason: 'horodatage' });
  });

  test('horodatage dans le futur au-delà de la fenêtre → refus', () => {
    const futur = NOW + MAX_SKEW_SECONDS + 1;
    const v = verifyRandytechSignature(BODY, String(futur), sign(futur, BODY), SECRET, NOW);
    assert.deepEqual(v, { ok: false, reason: 'horodatage' });
  });

  test('rejeu du même corps DANS la fenêtre → accepté ici (l’idempotence est côté messageId)', () => {
    // La signature ne protège pas du rejeu à l'intérieur des 5 minutes : c'est la clé
    // `sms_inbox/{provider}_msg_{messageId}` + `creditWallet(requestId)` qui empêchent le
    // double-crédit. Ce test fige la répartition des responsabilités.
    const sig = sign(NOW, BODY);
    assert.equal(verifyRandytechSignature(BODY, String(NOW), sig, SECRET, NOW).ok, true);
    assert.equal(verifyRandytechSignature(BODY, String(NOW), sig, SECRET, NOW + 60).ok, true);
  });

  test('aucun en-tête → « absent » (l’appelant essaie un autre moyen d’auth, sans pénalité)', () => {
    assert.deepEqual(verifyRandytechSignature(BODY, undefined, undefined, SECRET, NOW),
      { ok: false, reason: 'absent' });
  });

  test('en-tête timestamp seul (signature manquante) → refus, PAS « absent »', () => {
    assert.deepEqual(verifyRandytechSignature(BODY, String(NOW), undefined, SECRET, NOW),
      { ok: false, reason: 'signature' });
  });

  test('horodatage non numérique → refus', () => {
    assert.deepEqual(verifyRandytechSignature(BODY, 'bientot', sign(NOW, BODY), SECRET, NOW),
      { ok: false, reason: 'horodatage' });
  });
});

describe('reconcileSms — auto-crédit conservateur', () => {
  async function seedReq({ amountCents, ref, status = 'Pending Verification', method = 'MonCash' }) {
    await db.doc(`users/${UID}`).set({ uid: UID, walletBalanceCents: 0, totalAddedCents: 0 });
    await db.doc('wallet_requests/REQ_SMS').set({
      uid: UID, paymentMethod: method, status,
      expectedAmountCentimes: amountCents, transactionReference: ref,
    });
  }

  test('txId + montant concordants → crédite + demande Completed', async () => {
    await seedReq({ amountCents: 150000, ref: 'AB12CD34' });
    const r = await reconcileSms(db, parseSms('MonCash', 'Resevwa 1,500.00 HTG. Tranzaksyon: AB12CD34'));
    assert.equal(r.credited, true);
    assert.equal(r.requestId, 'REQ_SMS');
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 150000);
    const req = await db.doc('wallet_requests/REQ_SMS').get();
    assert.equal(req.get('status'), 'Completed');
  });

  test('idempotent : rejouer le même SMS ne double-crédite pas', async () => {
    await seedReq({ amountCents: 150000, ref: 'AB12CD34' });
    await reconcileSms(db, parseSms('MonCash', 'Resevwa 1,500.00 HTG. Tranzaksyon: AB12CD34'));
    // 2e passage (le doc reste, mais creditWallet dédupe sur requestId)
    await db.doc('wallet_requests/REQ_SMS').update({ status: 'Pending Verification' }); // simulate stale
    const r2 = await reconcileSms(db, parseSms('MonCash', 'Resevwa 1,500.00 HTG. Tranzaksyon: AB12CD34'));
    assert.equal(r2.deduped, true);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 150000); // pas 300000
  });

  test('montant discordant → NON crédité (repli manuel)', async () => {
    await seedReq({ amountCents: 150000, ref: 'AB12CD34' });
    const r = await reconcileSms(db, parseSms('MonCash', 'Resevwa 999.00 HTG. Tranzaksyon: AB12CD34'));
    assert.equal(r.credited, false);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 0);
  });

  test('txId absent → NON crédité', async () => {
    await seedReq({ amountCents: 150000, ref: 'AB12CD34' });
    const r = await reconcileSms(db, parseSms('MonCash', 'Resevwa 1,500.00 HTG. Mèsi.'));
    assert.equal(r.credited, false);
  });

  test('repli : TxID discordant mais NUMÉRO + montant concordants → SUGGÈRE sans créditer', async () => {
    await db.doc(`users/${UID}`).set({ uid: UID, walletBalanceCents: 0, totalAddedCents: 0 });
    await db.doc('wallet_requests/REQ_SMS').set({
      uid: UID, paymentMethod: 'NatCash', status: 'Pending Verification',
      expectedAmountCentimes: 150000, transactionReference: 'CLIENTCODE_DIFF', senderPhone: '40000000',
    });
    // SMS marchand : reçu 1500 HTG de 40000000, mais TransCode ≠ celui saisi par le client.
    const r = await reconcileSms(db, parseSms('NatCash',
      'Vous avez recu 1,500 HTG de SPECIMEN TEST 40000000 a 15:20 01/07/2026, contenu: Ok. Votre solde: 1,000.00 HTG. TransCode: MERCHANTCODE99. Merci'));

    // Le rapprochement est TROUVÉ (l'admin doit le voir) mais l'argent ne bouge PAS :
    // `senderPhone` est déclaré par le client et ne prouve la possession d'aucun numéro.
    assert.equal(r.matched, true);
    assert.equal(r.credited, false);
    assert.equal(r.needsReview, true);
    assert.equal(r.requestId, 'REQ_SMS');

    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 0);

    // La suggestion est posée sur la demande pour que reviewDeposit la présente à l'admin.
    const req = await db.doc('wallet_requests/REQ_SMS').get();
    assert.equal(req.get('suggestedMatch.by'), 'senderPhone');
    assert.equal(req.get('suggestedMatch.smsTxId'), 'MERCHANTCODE99');
    // La demande reste en attente : rien n'a été décidé à sa place.
    assert.equal(req.get('status'), 'Pending Verification');
  });

  test("SÉCURITÉ : revendiquer le numéro d'un tiers ne détourne PAS son dépôt", async () => {
    // Scénario d'audit : l'attaquant dépose une demande au numéro de la victime et au bon
    // montant, SANS connaître le TransCode (qu'il ne peut pas deviner : la transaction
    // n'a pas encore eu lieu). Il est ici le SEUL candidat — la victime n'a pas encore
    // créé sa propre demande. Avant le correctif, le SMS de la victime le créditait.
    const ATTACKER = 'uid_attaquant';
    await db.doc(`users/${ATTACKER}`).set({ uid: ATTACKER, walletBalanceCents: 0, totalAddedCents: 0 });
    await db.doc('wallet_requests/REQ_ATTAQUE').set({
      uid: ATTACKER, paymentMethod: 'NatCash', status: 'Pending Verification',
      expectedAmountCentimes: 150000,
      transactionReference: 'CODE_INVENTE',
      senderPhone: '40000000', // numéro de la victime, simplement déclaré
    });

    const r = await reconcileSms(db, parseSms('NatCash',
      'Vous avez recu 1,500 HTG de SPECIMEN TEST 40000000 a 15:20 01/07/2026, contenu: Ok. Votre solde: 1,000.00 HTG. TransCode: MERCHANTCODE99. Merci'));

    assert.equal(r.credited, false);
    const a = await db.doc(`users/${ATTACKER}`).get();
    assert.equal(a.get('walletBalanceCents'), 0); // pas un centime
  });

  test('repli : NUMÉRO expéditeur différent → NON crédité', async () => {
    await db.doc(`users/${UID}`).set({ uid: UID, walletBalanceCents: 0, totalAddedCents: 0 });
    await db.doc('wallet_requests/REQ_SMS').set({
      uid: UID, paymentMethod: 'NatCash', status: 'Pending Verification',
      expectedAmountCentimes: 150000, transactionReference: 'CLIENTCODE_DIFF', senderPhone: '99999999',
    });
    const r = await reconcileSms(db, parseSms('NatCash',
      'Vous avez recu 1,500 HTG de SPECIMEN TEST 40000000 a 15:20 01/07/2026, contenu: Ok. Votre solde: 1,000.00 HTG. TransCode: MERCHANTCODE99. Merci'));
    assert.equal(r.credited, false);
  });

  test('SÉCURITÉ : SMS SORTANT concordant (txId+montant) → JAMAIS crédité', async () => {
    // Une demande en attente existe avec ce txId+montant, mais le SMS est un "transferred" (sortant)
    await seedReq({ amountCents: 1350000, ref: '00000000000005' });
    const r = await reconcileSms(db, parseSms('NatCash',
      'You transferred 13,500 HTG to SPECIMEN TEST 40000000, fee: 63 HTG. TransCode: 00000000000005. Thank you'));
    assert.equal(r.credited, false);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 0); // aucun crédit
  });
});

describe('reconcileRequestFromInbox — rapprochement à la création de la demande (sens inverse)', () => {
  async function seedUser() {
    await db.doc(`users/${UID}`).set({ uid: UID, walletBalanceCents: 0, totalAddedCents: 0 });
  }
  async function seedInbox({ provider = 'NatCash', direction = 'in', amountCents, txId, status = 'unmatched' }) {
    await db.doc(`sms_inbox/${provider}_${txId}`).set({
      provider, direction, amountCents, txId,
      sender: '42065212', senderName: 'NORMIL KENIA', status, receivedAt: new Date(),
    });
  }
  async function seedReq({ id = 'WREQ_T', amount, ref, method = 'NatCash', status = 'Pending Verification' }) {
    await db.doc(`wallet_requests/${id}`).set({
      uid: UID, paymentMethod: method, status, amount, transactionReference: ref, senderPhone: '42065212',
    });
  }

  test('LE BUG DU 24/07 : SMS reçu AVANT la demande → la création rapproche et crédite', async () => {
    await seedUser();
    // Le SMS marchand est déjà là, resté « unmatched » faute de demande au moment de sa réception.
    await seedInbox({ amountCents: 4725000, txId: '26072343360583' });
    await seedReq({ amount: 47250, ref: '26072343360583' }); // amount en HTG entier, comme l'UI
    const r = await reconcileRequestFromInbox(db, 'WREQ_T');
    assert.equal(r.credited, true);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 4725000);
    const req = await db.doc('wallet_requests/WREQ_T').get();
    assert.equal(req.get('status'), 'Completed');
    const sms = await db.doc('sms_inbox/NatCash_26072343360583').get();
    assert.equal(sms.get('status'), 'credited'); // le journal reflète le crédit
  });

  test('idempotent : re-rapprocher ne double-crédite pas', async () => {
    await seedUser();
    await seedInbox({ amountCents: 4725000, txId: 'ABC123' });
    await seedReq({ amount: 47250, ref: 'ABC123' });
    await reconcileRequestFromInbox(db, 'WREQ_T');
    await db.doc('wallet_requests/WREQ_T').update({ status: 'Pending Verification' }); // simule un rejeu
    await db.doc('sms_inbox/NatCash_ABC123').update({ status: 'unmatched' });
    const r2 = await reconcileRequestFromInbox(db, 'WREQ_T');
    assert.equal(r2.deduped, true);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 4725000); // pas 9450000
  });

  test('aucun SMS pour ce txId → non crédité', async () => {
    await seedUser();
    await seedReq({ amount: 47250, ref: 'INCONNU' });
    const r = await reconcileRequestFromInbox(db, 'WREQ_T');
    assert.equal(r.credited, false);
    assert.equal((await db.doc(`users/${UID}`).get()).get('walletBalanceCents'), 0);
  });

  test('SÉCURITÉ : montant discordant même avec txId concordant → non crédité', async () => {
    await seedUser();
    await seedInbox({ amountCents: 4725000, txId: '999' });
    await seedReq({ amount: 100, ref: '999' }); // 100 HTG déclarés, SMS de 47 250
    const r = await reconcileRequestFromInbox(db, 'WREQ_T');
    assert.equal(r.credited, false);
  });

  test('SÉCURITÉ : SMS SORTANT concordant → jamais crédité (réutilise la garde de reconcileSms)', async () => {
    await seedUser();
    await seedInbox({ direction: 'out', amountCents: 4725000, txId: 'OUT1' });
    await seedReq({ amount: 47250, ref: 'OUT1' });
    const r = await reconcileRequestFromInbox(db, 'WREQ_T');
    assert.equal(r.credited, false);
  });

  test('SMS déjà crédité par une autre demande → non re-crédité', async () => {
    await seedUser();
    await seedInbox({ amountCents: 4725000, txId: '777', status: 'credited' });
    await seedReq({ amount: 47250, ref: '777' });
    const r = await reconcileRequestFromInbox(db, 'WREQ_T');
    assert.equal(r.credited, false);
    assert.equal((await db.doc(`users/${UID}`).get()).get('walletBalanceCents'), 0);
  });
});
