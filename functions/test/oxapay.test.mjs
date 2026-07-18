// Tests du gateway crypto OxaPay : vérification HMAC (sécurité webhook) + rapprochement.
// Exécuter après build ; via l'émulateur Firestore (npm run test:functions).
import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyCallbackSignature, parseCallback } from '../lib/lib/oxapay.js';
import { reconcileOxapayCallback } from '../lib/lib/oxapay-reconcile.js';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const app = initializeApp({ projectId: 'thie-thie-oxapay-test' }, 'oxapay');
const db = getFirestore(app);
const UID = 'userCrypto';
const API_KEY = 'test-merchant-key';

async function clearAll() {
  for (const c of ['users', 'wallet_requests', 'wallet_transactions', 'admin_audit']) {
    await db.recursiveDelete(db.collection(c));
  }
}
beforeEach(clearAll);
after(clearAll);

function sign(body, key = API_KEY) {
  return createHmac('sha512', key).update(body).digest('hex');
}

describe('verifyCallbackSignature', () => {
  test('accepte une signature valide', () => {
    const body = JSON.stringify({ track_id: 'T1', status: 'Paid', order_id: 'REQ1' });
    assert.equal(verifyCallbackSignature(body, sign(body), API_KEY), true);
  });

  test('rejette une signature calculée avec la mauvaise clé', () => {
    const body = JSON.stringify({ track_id: 'T1', status: 'Paid', order_id: 'REQ1' });
    assert.equal(verifyCallbackSignature(body, sign(body, 'wrong-key'), API_KEY), false);
  });

  test('rejette un corps modifié après signature (anti-tampering)', () => {
    const original = JSON.stringify({ track_id: 'T1', status: 'Paid', order_id: 'REQ1' });
    const tampered = JSON.stringify({ track_id: 'T1', status: 'Paid', order_id: 'REQ2' });
    assert.equal(verifyCallbackSignature(tampered, sign(original), API_KEY), false);
  });

  test('rejette une signature absente', () => {
    const body = JSON.stringify({ track_id: 'T1' });
    assert.equal(verifyCallbackSignature(body, undefined, API_KEY), false);
  });
});

describe('parseCallback', () => {
  test('extrait les champs attendus', () => {
    const cb = parseCallback({ track_id: 'T1', status: 'Paid', order_id: 'REQ1', amount: 10, currency: 'USD' });
    assert.deepEqual(cb, { trackId: 'T1', status: 'Paid', orderId: 'REQ1', amount: 10, currency: 'USD' });
  });
});

describe('reconcileOxapayCallback — crédit serveur-only, idempotent', () => {
  beforeEach(async () => {
    await db.doc(`users/${UID}`).set({ uid: UID, role: 'customer', walletBalanceCents: 0, thieThiePoints: 0 });
  });

  test('crédite sur status Paid et marque la demande Completed', async () => {
    await db.doc('wallet_requests/REQ1').set({
      requestId: 'REQ1', uid: UID, paymentMethod: 'Crypto', status: 'Pending Verification',
      expectedAmountCentimes: 130000, amountUsd: 10, createdAt: FieldValue.serverTimestamp(),
    });

    const res = await reconcileOxapayCallback(db, { trackId: 'T1', status: 'Paid', orderId: 'REQ1', amount: 10, currency: 'USD' });
    assert.equal(res.credited, true);
    assert.equal(res.deduped, false);

    const user = await db.doc(`users/${UID}`).get();
    assert.equal(user.get('walletBalanceCents'), 130000);
    const req = await db.doc('wallet_requests/REQ1').get();
    assert.equal(req.get('status'), 'Completed');
  });

  test('NE crédite PAS sur statut intermédiaire (Paying)', async () => {
    await db.doc('wallet_requests/REQ2').set({
      requestId: 'REQ2', uid: UID, paymentMethod: 'Crypto', status: 'Pending Verification',
      expectedAmountCentimes: 130000, amountUsd: 10, createdAt: FieldValue.serverTimestamp(),
    });

    const res = await reconcileOxapayCallback(db, { trackId: 'T2', status: 'Paying', orderId: 'REQ2', amount: 10, currency: 'USD' });
    assert.equal(res.credited, false);

    const user = await db.doc(`users/${UID}`).get();
    assert.equal(user.get('walletBalanceCents'), 0);
  });

  test('idempotent : un callback Paid rejoué ne crédite pas deux fois', async () => {
    await db.doc('wallet_requests/REQ3').set({
      requestId: 'REQ3', uid: UID, paymentMethod: 'Crypto', status: 'Pending Verification',
      expectedAmountCentimes: 130000, amountUsd: 10, createdAt: FieldValue.serverTimestamp(),
    });

    await reconcileOxapayCallback(db, { trackId: 'T3', status: 'Paid', orderId: 'REQ3', amount: 10, currency: 'USD' });
    const res2 = await reconcileOxapayCallback(db, { trackId: 'T3', status: 'Paid', orderId: 'REQ3', amount: 10, currency: 'USD' });
    assert.equal(res2.matched, true);
    assert.equal(res2.credited, false);
    assert.equal(res2.reason, 'déjà Completed');

    const user = await db.doc(`users/${UID}`).get();
    assert.equal(user.get('walletBalanceCents'), 130000); // pas 260000
  });

  test('ignore un order_id inconnu (facture forgée / expirée purgée)', async () => {
    const res = await reconcileOxapayCallback(db, { trackId: 'T4', status: 'Paid', orderId: 'DOES_NOT_EXIST', amount: 10, currency: 'USD' });
    assert.equal(res.matched, false);
  });

  test('ignore une wallet_request non-crypto (order_id ne doit pas se substituer à un dépôt MonCash)', async () => {
    await db.doc('wallet_requests/REQ5').set({
      requestId: 'REQ5', uid: UID, paymentMethod: 'MonCash', status: 'Pending Verification',
      expectedAmountCentimes: 50000, createdAt: FieldValue.serverTimestamp(),
    });
    const res = await reconcileOxapayCallback(db, { trackId: 'T5', status: 'Paid', orderId: 'REQ5', amount: 10, currency: 'USD' });
    assert.equal(res.credited, false);

    const user = await db.doc(`users/${UID}`).get();
    assert.equal(user.get('walletBalanceCents'), 0);
  });
});
