// Tests d'intégration du cœur financier sur l'émulateur Firestore.
// Importe la lib COMPILÉE (../lib) — exécuter après `npm run build`.
// Lancé via `firebase emulators:exec --only firestore` (cf. root `npm run test:functions`).
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { creditWallet, placeOrder, redeemReward, DomainError } from '../lib/lib/transactions.js';
import { seedCatalog } from '../lib/lib/seed.js';
import { CATALOG_VARIANTS } from '../lib/data/catalog.data.js';
import { pointsForOrder } from '../lib/data/rewards.data.js';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

const app = initializeApp({ projectId: 'thie-thie-fns-test' });
const db = getFirestore(app);

const UID = 'userA';

async function clearAll() {
  await db.recursiveDelete(db.collection('users'));
  await db.recursiveDelete(db.collection('products'));
  await db.recursiveDelete(db.collection('orders'));
  await db.recursiveDelete(db.collection('wallet_transactions'));
  await db.recursiveDelete(db.collection('admin_audit'));
  await db.recursiveDelete(db.collection('config'));
}

async function seedUser(balanceCents) {
  await db.doc(`users/${UID}`).set({
    uid: UID, role: 'customer', walletBalanceCents: balanceCents,
    totalAddedCents: 0, totalSpentCents: 0,
  });
}

beforeEach(clearAll);
after(clearAll);

describe('creditWallet — idempotent & audité', () => {
  test('crédite le solde et écrit le ledger + audit', async () => {
    await seedUser(0);
    const r = await creditWallet(db, { uid: UID, amountCents: 50000, idempotencyKey: 'REQ1', type: 'deposit', actorUid: 'admin1' });
    assert.equal(r.deduped, false);
    assert.equal(r.balanceAfterCents, 50000);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 50000);
    assert.equal(u.get('totalAddedCents'), 50000);
    const tx = await db.doc('wallet_transactions/REQ1').get();
    assert.equal(tx.get('amountCents'), 50000);
    const audit = await db.collection('admin_audit').get();
    assert.ok(audit.size >= 1);
  });

  test('idempotent : 2e appel même clé → pas de double-crédit', async () => {
    await seedUser(0);
    await creditWallet(db, { uid: UID, amountCents: 50000, idempotencyKey: 'REQ1', type: 'deposit' });
    const r2 = await creditWallet(db, { uid: UID, amountCents: 50000, idempotencyKey: 'REQ1', type: 'deposit' });
    assert.equal(r2.deduped, true);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 50000); // pas 100000
  });

  test('refuse un montant ≤ 0', async () => {
    await seedUser(0);
    await assert.rejects(
      () => creditWallet(db, { uid: UID, amountCents: 0, idempotencyKey: 'X', type: 'deposit' }),
      (e) => e instanceof DomainError && e.code === 'invalid-amount'
    );
  });

  test('refuse un montant float (non centimes entiers)', async () => {
    await seedUser(0);
    await assert.rejects(
      () => creditWallet(db, { uid: UID, amountCents: 12.5, idempotencyKey: 'Y', type: 'deposit' })
    );
  });
});

describe('placeOrder — débit transactionnel, stock atomique, solde ≥ 0', () => {
  async function seedProduct(over = {}) {
    await db.doc('products/p1').set({ name: 'Free Fire 100💎', priceCents: 30000, stock: 5, available: true, currency: 'HTG', ...over });
  }

  test('débite, décrémente le stock, écrit commande + ledger', async () => {
    await seedUser(100000);
    await seedProduct();
    const r = await placeOrder(db, { uid: UID, productId: 'p1', quantity: 2, idempotencyKey: 'ORD1' });
    assert.equal(r.totalCents, 60000);
    assert.equal(r.balanceAfterCents, 40000);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 40000);
    assert.equal(u.get('totalSpentCents'), 60000);
    const p = await db.doc('products/p1').get();
    assert.equal(p.get('stock'), 3);
    const o = await db.doc('orders/ORD1').get();
    assert.equal(o.get('status'), 'completed');
    assert.equal(o.get('priceCents'), 60000);
  });

  test('solde insuffisant → refus, aucun débit', async () => {
    await seedUser(10000);
    await seedProduct();
    await assert.rejects(
      () => placeOrder(db, { uid: UID, productId: 'p1', quantity: 1, idempotencyKey: 'ORD2' }),
      (e) => e instanceof DomainError && e.code === 'insufficient-funds'
    );
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 10000); // inchangé
    const o = await db.doc('orders/ORD2').get();
    assert.equal(o.exists, false);
  });

  test('stock insuffisant → refus', async () => {
    await seedUser(1000000);
    await seedProduct({ stock: 1 });
    await assert.rejects(
      () => placeOrder(db, { uid: UID, productId: 'p1', quantity: 2, idempotencyKey: 'ORD3' }),
      (e) => e instanceof DomainError && e.code === 'out-of-stock'
    );
  });

  test('idempotent : 2e appel même clé → un seul débit', async () => {
    await seedUser(100000);
    await seedProduct();
    await placeOrder(db, { uid: UID, productId: 'p1', quantity: 1, idempotencyKey: 'ORD4' });
    const r2 = await placeOrder(db, { uid: UID, productId: 'p1', quantity: 1, idempotencyKey: 'ORD4' });
    assert.equal(r2.deduped, true);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 70000); // un seul débit de 30000
    const p = await db.doc('products/p1').get();
    assert.equal(p.get('stock'), 4); // décrémenté une seule fois
  });

  // SÉCURITÉ (défense en profondeur) : un doc `orders/{key}` NON produit par le serveur
  // (statut ≠ 'completed', ex. forge client) ne doit PAS court-circuiter le débit via l'idempotence.
  // placeOrder doit refuser (order-conflict) plutôt que renvoyer un faux succès sans paiement.
  test('anti-forge : order pré-existant non-serveur (statut pending) → refus, aucun débit', async () => {
    await seedUser(100000);
    await seedProduct();
    // Simule une commande forgée (ce qu'un client aurait pu écrire avant le durcissement des règles) :
    await db.doc('orders/FORGED').set({
      orderId: 'FORGED', uid: UID, userId: UID, status: 'Pending Verification',
      priceCents: 0, balanceAfterCents: 99999999, createdAt: 'x',
    });
    await assert.rejects(
      () => placeOrder(db, { uid: UID, productId: 'p1', quantity: 1, idempotencyKey: 'FORGED' }),
      (e) => e instanceof DomainError && e.code === 'order-conflict'
    );
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 100000); // AUCUN débit
    const p = await db.doc('products/p1').get();
    assert.equal(p.get('stock'), 5); // stock intact
  });

  test('bien libellé USD : conversion FX via config/fx', async () => {
    await seedUser(100000);
    // 1 USD = 132.50 HTG → htgCentsPerUsd = 13250 ; produit à 2.00 USD (priceUsdCents=200)
    await db.doc('config/fx').set({ htgCentsPerUsd: 13250 });
    await db.doc('products/gc1').set({ name: 'Gift Card 2$', currency: 'USD', priceUsdCents: 200, stock: 10, available: true });
    const r = await placeOrder(db, { uid: UID, productId: 'gc1', quantity: 1, idempotencyKey: 'ORD5' });
    // 2.00 USD * 13250 c/USD = 26500 centimes HTG
    assert.equal(r.totalCents, 26500);
    assert.equal(r.balanceAfterCents, 73500);
  });

  test('métadonnées de livraison (playerId/region/optionLabel) persistées sur la commande', async () => {
    await seedUser(100000);
    await seedProduct();
    await placeOrder(db, {
      uid: UID, productId: 'p1', quantity: 1, idempotencyKey: 'ORD6',
      playerId: '123456789', region: 'LATAM', optionLabel: '100 +10 Diamonds',
    });
    const o = await db.doc('orders/ORD6').get();
    assert.equal(o.get('playerId'), '123456789');
    assert.equal(o.get('region'), 'LATAM');
    assert.equal(o.get('optionLabel'), '100 +10 Diamonds');
    assert.equal(o.get('paymentMethod'), 'wallet');
  });

  // MONTANT LIBRE (cartes à plage) : le prix est recalculé SERVEUR depuis le montant client.
  async function seedRange(over = {}) {
    await db.doc('products/rng1').set({
      name: 'Visa', priceCents: 900, stock: 5, available: true, currency: 'HTG',
      pricing: { type: 'range', minUsdCents: 100, maxUsdCents: 15000, discountBps: 0, fixedFeeUsdCents: 0, feeBps: 0 },
      ...over,
    });
  }

  test('montant libre : prix recalculé serveur ($25 → 4220 HTG, marge 15%, défauts de config)', async () => {
    await seedUser(1000000);
    await seedRange();
    const r = await placeOrder(db, { uid: UID, productId: 'rng1', idempotencyKey: 'RNG1', amountUsdCents: 2500 });
    // $25 → wholesale 2500 → ×1.01 → ×142 → ÷0.85 → arrondi 5 HTG = 422000 centimes.
    assert.equal(r.totalCents, 422000);
    assert.equal(r.balanceAfterCents, 578000);
  });

  test('montant libre : montant absent → refus (invalid-amount), aucun débit', async () => {
    await seedUser(1000000);
    await seedRange();
    await assert.rejects(
      () => placeOrder(db, { uid: UID, productId: 'rng1', idempotencyKey: 'RNG2' }),
      (e) => e instanceof DomainError && e.code === 'invalid-amount',
    );
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 1000000);
  });

  test('dénominations fixes (Netflix) : le client choisit $50 dans une carte multi-montants → prix serveur', async () => {
    await seedUser(5000000);
    await db.doc('products/nfx').set({
      name: 'Netflix US', priceCents: 100, stock: 5, available: true, currency: 'HTG',
      pricing: { type: 'fixed', denominations: [2000, 2500, 5000, 10000], discountBps: 0, fixedFeeUsdCents: 0, feeBps: 800 },
    });
    // $50 face + 8% fee = $54 → ×1.01 → ×142 → ÷0.85 → arrondi 5 HTG = 9115 HTG (911500 c) l'unité.
    const r = await placeOrder(db, { uid: UID, productId: 'nfx', idempotencyKey: 'NFX1', amountUsdCents: 5000, quantity: 2 });
    assert.equal(r.totalCents, 1823000); // 911500 × 2
    assert.equal(r.balanceAfterCents, 3177000);
  });

  test('dénominations fixes : dénomination non listée ($30) → refus, aucun débit', async () => {
    await seedUser(1000000);
    await db.doc('products/nfx2').set({
      name: 'Netflix US', priceCents: 100, stock: 5, available: true, currency: 'HTG',
      pricing: { type: 'fixed', denominations: [2000, 2500, 5000], discountBps: 0, fixedFeeUsdCents: 0, feeBps: 0 },
    });
    await assert.rejects(
      () => placeOrder(db, { uid: UID, productId: 'nfx2', idempotencyKey: 'NFX2', amountUsdCents: 3000 }),
      (e) => e instanceof DomainError && e.code === 'invalid-amount',
    );
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 1000000);
  });

  test('montant libre : montant non entier ($25,10 = 2510c) → refus (dollars entiers)', async () => {
    await seedUser(1000000);
    await seedRange();
    await assert.rejects(
      () => placeOrder(db, { uid: UID, productId: 'rng1', idempotencyKey: 'RNG4', amountUsdCents: 2510 }),
      (e) => e instanceof DomainError && e.code === 'invalid-amount',
    );
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('walletBalanceCents'), 1000000);
  });

  test('montant libre : montant hors plage (> max) → refus, aucun débit', async () => {
    await seedUser(1000000);
    await seedRange();
    await assert.rejects(
      () => placeOrder(db, { uid: UID, productId: 'rng1', idempotencyKey: 'RNG3', amountUsdCents: 20000 }),
      (e) => e instanceof DomainError && e.code === 'invalid-amount',
    );
    const p = await db.doc('products/rng1').get();
    assert.equal(p.get('stock'), 5);
  });
});

describe('seedCatalog — produits Firestore (source de vérité prix/stock)', () => {
  test('sème toutes les variantes avec le bon prix en centimes', async () => {
    const res = await seedCatalog(db);
    assert.equal(res.written, CATALOG_VARIANTS.length);
    assert.ok(CATALOG_VARIANTS.length >= 60);
    // Variante connue : Free Fire 100+10 → 175 HTG = 17500 centimes
    const d = await db.doc('products/ff-diamonds__0').get();
    assert.equal(d.get('priceCents'), 17500);
    assert.equal(d.get('currency'), 'HTG');
    assert.equal(d.get('available'), true);
    assert.equal(d.get('stock'), 999);
    // Nombre de docs semés = nombre de variantes
    const all = await db.collection('products').get();
    assert.equal(all.size, CATALOG_VARIANTS.length);
  });

  test('placeOrder fonctionne contre un produit semé (débit du bon montant)', async () => {
    await seedCatalog(db);
    await seedUser(50000);
    const r = await placeOrder(db, { uid: UID, productId: 'ff-diamonds__0', quantity: 1, idempotencyKey: 'ORDSEED' });
    assert.equal(r.totalCents, 17500);
    assert.equal(r.balanceAfterCents, 32500);
  });

  test('re-seed avec setStock=false préserve le stock ajusté', async () => {
    await seedCatalog(db);
    await db.doc('products/ff-diamonds__0').update({ stock: 3 }); // admin ajuste
    await seedCatalog(db, { setStock: false });                    // re-synchro catalogue
    const d = await db.doc('products/ff-diamonds__0').get();
    assert.equal(d.get('stock'), 3); // préservé
  });
});

describe('points fidélité — octroi serveur (placeOrder) & rédemption', () => {
  test('placeOrder octroie les points SERVEUR (thieThiePoints) au taux attendu', async () => {
    await seedUser(1_000_000);
    await seedCatalog(db, { setStock: true });
    const price = 17500; // ff-diamonds__0
    const expected = pointsForOrder(price); // round(17500/1450) = 12
    const r = await placeOrder(db, { uid: UID, productId: 'ff-diamonds__0', quantity: 1, idempotencyKey: 'ORD-PTS-1' });
    assert.equal(r.pointsEarned, expected);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('thieThiePoints'), expected);
    const o = await db.doc('orders/ORD-PTS-1').get();
    assert.equal(o.get('pointsEarned'), expected);
  });

  test('placeOrder idempotent : pas de double octroi de points', async () => {
    await seedUser(1_000_000);
    await seedCatalog(db, { setStock: true });
    await placeOrder(db, { uid: UID, productId: 'ff-diamonds__0', quantity: 1, idempotencyKey: 'ORD-PTS-2' });
    await placeOrder(db, { uid: UID, productId: 'ff-diamonds__0', quantity: 1, idempotencyKey: 'ORD-PTS-2' });
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('thieThiePoints'), pointsForOrder(17500)); // une seule fois
  });

  test('redeemReward : débite les points et émet le coupon', async () => {
    await db.doc(`users/${UID}`).set({ uid: UID, role: 'customer', walletBalanceCents: 0, thieThiePoints: 500 });
    const r = await redeemReward(db, { uid: UID, rewardId: 'promo10', idempotencyKey: 'CPN-1' });
    assert.equal(r.deduped, false);
    assert.equal(r.code, 'THIE10');
    assert.equal(r.pointsAfter, 400);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('thieThiePoints'), 400);
    const c = await db.doc(`users/${UID}/coupons/CPN-1`).get();
    assert.ok(c.exists);
    assert.equal(c.get('code'), 'THIE10');
    assert.equal(c.get('cost'), 100);
  });

  test('redeemReward REFUS : points insuffisants', async () => {
    await db.doc(`users/${UID}`).set({ uid: UID, role: 'customer', walletBalanceCents: 0, thieThiePoints: 50 });
    await assert.rejects(
      () => redeemReward(db, { uid: UID, rewardId: 'promo10', idempotencyKey: 'CPN-2' }),
      (e) => e instanceof DomainError && e.code === 'insufficient-points'
    );
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('thieThiePoints'), 50); // inchangé
  });

  test('redeemReward idempotent : rejeu même clé → pas de double débit', async () => {
    await db.doc(`users/${UID}`).set({ uid: UID, role: 'customer', walletBalanceCents: 0, thieThiePoints: 500 });
    await redeemReward(db, { uid: UID, rewardId: 'promo10', idempotencyKey: 'CPN-3' });
    const r2 = await redeemReward(db, { uid: UID, rewardId: 'promo10', idempotencyKey: 'CPN-3' });
    assert.equal(r2.deduped, true);
    const u = await db.doc(`users/${UID}`).get();
    assert.equal(u.get('thieThiePoints'), 400); // débité une seule fois
  });

  test('redeemReward REFUS : récompense inconnue (catalogue serveur)', async () => {
    await db.doc(`users/${UID}`).set({ uid: UID, role: 'customer', walletBalanceCents: 0, thieThiePoints: 9999 });
    await assert.rejects(
      () => redeemReward(db, { uid: UID, rewardId: 'HACK_FREE', idempotencyKey: 'CPN-4' }),
      (e) => e instanceof DomainError && e.code === 'reward-not-found'
    );
  });
});
