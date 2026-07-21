// Tests du « SMS hook » MonCash/NatCash : parsing + rapprochement + auto-crédit idempotent.
// Exécuter après build ; via l'émulateur Firestore (npm run test:functions).
import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseSms, parseHtgAmountToCents } from '../lib/lib/sms.js';
import { reconcileSms } from '../lib/lib/deposit-reconcile.js';

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
