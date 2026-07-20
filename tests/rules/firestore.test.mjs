// Suite de règles Firestore — J0.
// Cible : RF-1 (inflation de solde côté client) + privilège escalade (auto-admin) + ledger serveur-only.
// Lancée via `firebase emulators:exec` (Firestore emulator) -> `npm run test:rules`.
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'thie-thie-rules-test';
const USER = { uid: 'userA', email: 'a@example.com' };
const OTHER = { uid: 'userB', email: 'b@example.com' };
const ADMIN = { uid: 'adminX', email: 'admin@example.com' };

let testEnv;

// Contexte authentifié avec email + email_verified (utilisés par les règles).
function authedDb(u, extraClaims = {}) {
  return testEnv
    .authenticatedContext(u.uid, { email: u.email, email_verified: true, ...extraClaims })
    .firestore();
}

// Doc utilisateur valide minimal (customer, soldes à zéro).
function baseUserDoc(u, overrides = {}) {
  return {
    uid: u.uid,
    displayName: 'Joueur',
    fullName: 'Joueur Test',
    email: u.email,
    role: 'customer',
    thieThiePoints: 0,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    ...overrides,
  };
}

// Seed direct (bypass des règles) pour préparer l'état existant.
async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('users — création', () => {
  test('OK: auto-provision en customer, soldes à zéro', async () => {
    const db = authedDb(USER);
    await assertSucceeds(
      setDoc(doc(db, 'users', USER.uid), baseUserDoc(USER, { balance: 0, walletBalance: 0 }))
    );
  });

  test('REFUS: privesc — se créer en role=admin', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'users', USER.uid), baseUserDoc(USER, { role: 'admin' }))
    );
  });

  test('REFUS: auto-crédit au create — balance non nulle', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'users', USER.uid), baseUserDoc(USER, { balance: 999999 }))
    );
  });

  test('REFUS: auto-crédit au create — thieThiePoints non nul', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'users', USER.uid), baseUserDoc(USER, { thieThiePoints: 5000 }))
    );
  });

  test('REFUS: create sans fullName (régression bug handleAuthSubmit)', async () => {
    const db = authedDb(USER);
    const { fullName, ...rest } = baseUserDoc(USER);
    await assertFails(setDoc(doc(db, 'users', USER.uid), rest));
  });

  test('REFUS: create sans role (régression bug handleAuthSubmit)', async () => {
    const db = authedDb(USER);
    const { role, ...rest } = baseUserDoc(USER);
    await assertFails(setDoc(doc(db, 'users', USER.uid), rest));
  });
});

describe('products — catalogue (lecture publique, écriture serveur-only)', () => {
  test('OK: lecture publique même non authentifié', async () => {
    await seed('products/ff-diamonds__0', { id: 'ff-diamonds__0', priceCents: 17500, stock: 999, available: true });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'products', 'ff-diamonds__0')));
  });

  test('REFUS: écriture client (prix/stock serveur-only)', async () => {
    const db = authedDb(USER);
    await assertFails(setDoc(doc(db, 'products', 'ff-diamonds__0'), { id: 'x', priceCents: 1, stock: 1, available: true }));
  });
});

describe('config/depositAccounts — lecture publique, écriture serveur-only', () => {
  test('OK: lecture publique même non authentifié', async () => {
    await seed('config/depositAccounts', { moncashName: 'x', moncashNumber: '1', natcashName: 'x', natcashNumber: '1', binancePayId: '1', paypalEmail: 'x@x.com' });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'config', 'depositAccounts')));
  });

  test('REFUS: écriture client', async () => {
    const db = authedDb(USER);
    await assertFails(setDoc(doc(db, 'config', 'depositAccounts'), { moncashName: 'hack' }));
  });

  test('OK: lecture publique de config/fx (le taux de change EST une info publique affichée sur le site)', async () => {
    await seed('config/fx', { htgCentsPerUsd: 14500 });
    const db = authedDb(USER);
    await assertSucceeds(getDoc(doc(db, 'config', 'fx')));
  });

  test('REFUS: écriture de config/fx (serveur-only via callable setFxRate)', async () => {
    await seed('config/fx', { htgCentsPerUsd: 14500 });
    const db = authedDb(USER);
    await assertFails(setDoc(doc(db, 'config', 'fx'), { htgCentsPerUsd: 1 }));
  });
});

describe('users — update (RF-1)', () => {
  beforeEach(async () => {
    await seed(`users/${USER.uid}`, baseUserDoc(USER, {
      balance: 100, walletBalance: 100, thieThiePoints: 10,
      totalAdded: 100, totalMoneyAdded: 100, totalSpent: 0, totalMoneySpent: 0,
    }));
  });

  test('OK: cosmétique (displayName)', async () => {
    const db = authedDb(USER);
    await assertSucceeds(
      updateDoc(doc(db, 'users', USER.uid), { displayName: 'NouveauNom', updatedAt: 'x' })
    );
  });

  test('REFUS: inflation positive de balance (angle mort RF-1)', async () => {
    const db = authedDb(USER);
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { balance: 9999999 })
    );
  });

  test('REFUS: inflation de walletBalance', async () => {
    const db = authedDb(USER);
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { walletBalance: 9999999 })
    );
  });

  test('REFUS: inflation de thieThiePoints', async () => {
    const db = authedDb(USER);
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { thieThiePoints: 999999 })
    );
  });

  test('REFUS: falsification de totalMoneyAdded', async () => {
    const db = authedDb(USER);
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { totalMoneyAdded: 999999 })
    );
  });

  test('REFUS: privesc — changer role en admin via update', async () => {
    const db = authedDb(USER);
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { role: 'admin' })
    );
  });

  test('REFUS: écrire le doc d\'autrui (sans claim admin)', async () => {
    const db = authedDb(OTHER);
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { displayName: 'pirate' })
    );
  });

  test('REFUS: même un admin (claim) ne crédite pas via client (invariant 3)', async () => {
    const db = authedDb(ADMIN, { admin: true });
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { balance: 9999999 })
    );
  });

  test('OK: admin (claim) lit le doc d\'autrui', async () => {
    const db = authedDb(ADMIN, { admin: true });
    await assertSucceeds(getDoc(doc(db, 'users', USER.uid)));
  });
});

describe('users — fcmTokens (notifications push)', () => {
  beforeEach(async () => {
    await seed(`users/${USER.uid}`, baseUserDoc(USER));
  });

  test('OK: le propriétaire enregistre un jeton FCM', async () => {
    const db = authedDb(USER);
    await assertSucceeds(
      updateDoc(doc(db, 'users', USER.uid), { fcmTokens: ['token-abc'], updatedAt: 'x' })
    );
  });

  test('REFUS: fcmTokens qui n\'est pas une liste', async () => {
    const db = authedDb(USER);
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { fcmTokens: 'token-abc' })
    );
  });

  test('REFUS: fcmTokens dépasse la taille bornée (>10)', async () => {
    const db = authedDb(USER);
    const tooMany = Array.from({ length: 11 }, (_, i) => `token-${i}`);
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { fcmTokens: tooMany })
    );
  });

  test('REFUS: un solde ne se glisse pas dans la même écriture que fcmTokens', async () => {
    const db = authedDb(USER);
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { fcmTokens: ['token-abc'], walletBalance: 999999 })
    );
  });

  test('REFUS: écrire le fcmTokens d\'autrui', async () => {
    const db = authedDb(OTHER);
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { fcmTokens: ['token-abc'] })
    );
  });
});

describe('coupons — émission serveur-only', () => {
  beforeEach(async () => {
    await seed(`users/${USER.uid}`, baseUserDoc(USER, { thieThiePoints: 0 }));
  });

  test('REFUS: client mint un coupon (sans dépense de points vérifiée)', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'users', USER.uid, 'coupons', 'C1'), {
        id: 'r1', code: 'FREE', titleFR: 'Cadeau', titleHT: 'Kado', cost: 500, claimedAt: 'x',
      })
    );
  });
});

describe('wallet_transactions — ledger serveur-only', () => {
  test('REFUS: client crée une transaction (auto-crédit ledger)', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'wallet_transactions', 'TXW1'), {
        transactionId: 'TXW1', uid: USER.uid, type: 'deposit', amount: 100,
        balanceBefore: 0, balanceAfter: 100, status: 'Completed', createdAt: 'x',
      })
    );
  });

  test('REFUS: même un admin (claim) crée une transaction côté client', async () => {
    const db = authedDb(ADMIN, { admin: true });
    await assertFails(
      setDoc(doc(db, 'wallet_transactions', 'TXW2'), {
        transactionId: 'TXW2', uid: USER.uid, type: 'deposit', amount: 100,
        balanceBefore: 0, balanceAfter: 100, status: 'Completed', createdAt: 'x',
      })
    );
  });
});

describe('admin_audit — lisible par un admin, jamais écrit côté client', () => {
  test('REFUS: un utilisateur ordinaire lit le journal d’audit', async () => {
    const db = authedDb(USER);
    await assertFails(getDoc(doc(db, 'admin_audit', 'A1')));
  });

  test('OK: un admin lit le journal d’audit', async () => {
    const db = authedDb(ADMIN, { admin: true });
    await assertSucceeds(getDoc(doc(db, 'admin_audit', 'A1')));
  });

  test('REFUS: même un admin ÉCRIT dans le journal (sinon il efface sa propre trace)', async () => {
    const db = authedDb(ADMIN, { admin: true });
    await assertFails(
      setDoc(doc(db, 'admin_audit', 'A2'), { action: 'faux', actorUid: ADMIN.uid })
    );
  });
});

describe('wallet_requests — transitions serveur-only', () => {
  // NB (fix drift 2026-07-16) : la seule valeur réellement écrite par l'app
  // (UserProfile.tsx handleSubmitDeposit) est 'Pending Verification' — pas 'PendingReview'.
  test('OK: client crée une demande en Pending Verification', async () => {
    const db = authedDb(USER);
    await assertSucceeds(
      setDoc(doc(db, 'wallet_requests', 'REQ1'), {
        requestId: 'REQ1', uid: USER.uid, amount: 500, paymentMethod: 'MonCash',
        transactionReference: 'ref', screenshotURL: 'url', status: 'Pending Verification', createdAt: 'x',
      })
    );
  });

  test('REFUS: client crée une demande déjà Completed', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'wallet_requests', 'REQ2'), {
        requestId: 'REQ2', uid: USER.uid, amount: 500, paymentMethod: 'MonCash',
        transactionReference: 'ref', screenshotURL: 'url', status: 'Completed', createdAt: 'x',
      })
    );
  });

  test('REFUS: montant aberrant (injection de milliers de chiffres > 1 000 000)', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'wallet_requests', 'REQBIG'), {
        requestId: 'REQBIG', uid: USER.uid, amount: 99999999999, paymentMethod: 'MonCash',
        transactionReference: 'ref', screenshotURL: 'url', status: 'Pending Verification', createdAt: 'x',
      })
    );
  });

  test('REFUS: montant sous le minimum (< 10 HTG)', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'wallet_requests', 'REQMIN'), {
        requestId: 'REQMIN', uid: USER.uid, amount: 1, paymentMethod: 'MonCash',
        transactionReference: 'ref', screenshotURL: 'url', status: 'Pending Verification', createdAt: 'x',
      })
    );
  });

  test('REFUS: client passe sa demande à Completed (transition)', async () => {
    await seed('wallet_requests/REQ3', {
      requestId: 'REQ3', uid: USER.uid, amount: 500, paymentMethod: 'MonCash',
      transactionReference: 'ref', screenshotURL: 'url', status: 'Pending Verification', createdAt: 'x',
    });
    const db = authedDb(USER);
    await assertFails(
      updateDoc(doc(db, 'wallet_requests', 'REQ3'), { status: 'Completed' })
    );
  });

  test('REFUS: admin (claim) valide via client (doit passer par Function)', async () => {
    await seed('wallet_requests/REQ4', {
      requestId: 'REQ4', uid: USER.uid, amount: 500, paymentMethod: 'MonCash',
      transactionReference: 'ref', screenshotURL: 'url', status: 'Pending Verification', createdAt: 'x',
    });
    const db = authedDb(ADMIN, { admin: true });
    await assertFails(
      updateDoc(doc(db, 'wallet_requests', 'REQ4'), { status: 'Completed' })
    );
  });
});

describe('kyc_requests — création client, transitions serveur-only', () => {
  test('OK: client crée sa demande KYC en pending', async () => {
    const db = authedDb(USER);
    await assertSucceeds(
      setDoc(doc(db, 'kyc_requests', 'KYC1'), {
        requestId: 'KYC1', uid: USER.uid, fullName: 'Joueur Test',
        idPhotoURL: 'https://x/id.jpg', selfiePhotoURL: 'https://x/selfie.jpg',
        status: 'pending', createdAt: 'x',
      })
    );
  });

  test('REFUS: créer une demande déjà approved', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'kyc_requests', 'KYC2'), {
        requestId: 'KYC2', uid: USER.uid, fullName: 'Joueur Test',
        idPhotoURL: 'https://x/id.jpg', selfiePhotoURL: 'https://x/selfie.jpg',
        status: 'approved', createdAt: 'x',
      })
    );
  });

  test('REFUS: créer une demande pour un autre uid', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'kyc_requests', 'KYC3'), {
        requestId: 'KYC3', uid: OTHER.uid, fullName: 'Joueur Test',
        idPhotoURL: 'https://x/id.jpg', selfiePhotoURL: 'https://x/selfie.jpg',
        status: 'pending', createdAt: 'x',
      })
    );
  });

  test('REFUS: client passe sa demande à approved (transition)', async () => {
    await seed('kyc_requests/KYC4', {
      requestId: 'KYC4', uid: USER.uid, fullName: 'Joueur Test',
      idPhotoURL: 'https://x/id.jpg', selfiePhotoURL: 'https://x/selfie.jpg',
      status: 'pending', createdAt: 'x',
    });
    const db = authedDb(USER);
    await assertFails(updateDoc(doc(db, 'kyc_requests', 'KYC4'), { status: 'approved' }));
  });

  test('REFUS: admin (claim) valide via client (doit passer par reviewKyc)', async () => {
    await seed('kyc_requests/KYC5', {
      requestId: 'KYC5', uid: USER.uid, fullName: 'Joueur Test',
      idPhotoURL: 'https://x/id.jpg', selfiePhotoURL: 'https://x/selfie.jpg',
      status: 'pending', createdAt: 'x',
    });
    const db = authedDb(ADMIN, { admin: true });
    await assertFails(updateDoc(doc(db, 'kyc_requests', 'KYC5'), { status: 'approved' }));
  });

  test('OK: propriétaire lit sa propre demande', async () => {
    await seed('kyc_requests/KYC6', {
      requestId: 'KYC6', uid: USER.uid, fullName: 'Joueur Test',
      idPhotoURL: 'https://x/id.jpg', selfiePhotoURL: 'https://x/selfie.jpg',
      status: 'pending', createdAt: 'x',
    });
    const db = authedDb(USER);
    await assertSucceeds(getDoc(doc(db, 'kyc_requests', 'KYC6')));
  });

  test('REFUS: un autre utilisateur lit la demande', async () => {
    await seed('kyc_requests/KYC7', {
      requestId: 'KYC7', uid: USER.uid, fullName: 'Joueur Test',
      idPhotoURL: 'https://x/id.jpg', selfiePhotoURL: 'https://x/selfie.jpg',
      status: 'pending', createdAt: 'x',
    });
    const db = authedDb(OTHER);
    await assertFails(getDoc(doc(db, 'kyc_requests', 'KYC7')));
  });
});

describe('users — kycStatus verrouillé serveur (gate recharge crypto)', () => {
  beforeEach(async () => {
    await seed(`users/${USER.uid}`, baseUserDoc(USER, { kycStatus: 'none' }));
  });

  test('REFUS: auto-approbation kycStatus au create', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'users', OTHER.uid), baseUserDoc(OTHER, { kycStatus: 'approved' }))
    );
  });

  test('REFUS: client passe son propre kycStatus à approved', async () => {
    const db = authedDb(USER);
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { kycStatus: 'approved' })
    );
  });

  test('REFUS: même un admin (claim) approuve le KYC via client (doit passer par reviewKyc)', async () => {
    const db = authedDb(ADMIN, { admin: true });
    await assertFails(
      updateDoc(doc(db, 'users', USER.uid), { kycStatus: 'approved' })
    );
  });

  test('OK: cosmétique reste possible avec kycStatus présent', async () => {
    const db = authedDb(USER);
    await assertSucceeds(
      updateDoc(doc(db, 'users', USER.uid), { displayName: 'NouveauNom', updatedAt: 'x' })
    );
  });
});

describe('orders — prix immuable', () => {
  beforeEach(async () => {
    await seed('orders/ORD1', {
      orderId: 'ORD1', userId: USER.uid, uid: USER.uid, productName: 'Free Fire',
      productSlug: 'free-fire', amount: '100 diamants', priceUSD: 1.0,
      paymentMethod: 'wallet', region: 'HT', status: 'pending', createdAt: 'x',
    });
  });

  test('OK: annuler sa commande en attente', async () => {
    const db = authedDb(USER);
    await assertSucceeds(
      updateDoc(doc(db, 'orders', 'ORD1'), { status: 'cancelled' })
    );
  });

  test('REFUS: falsifier le prix d\'une commande', async () => {
    const db = authedDb(USER);
    await assertFails(
      updateDoc(doc(db, 'orders', 'ORD1'), { priceUSD: 0.0, status: 'cancelled' })
    );
  });

  // SÉCURITÉ (invariant 3) : les commandes sont créées SERVEUR-ONLY (placeOrder / Admin SDK).
  // Autoriser la création client = forge de commande impayée + empoisonnement de l'idempotence
  // de placeOrder (contournement de paiement). Le client ne doit JAMAIS pouvoir créer un order.
  test('REFUS: client crée une commande (serveur-only, anti-forge)', async () => {
    const db = authedDb(USER);
    await assertFails(
      setDoc(doc(db, 'orders', 'FORGED1'), {
        orderId: 'FORGED1', userId: USER.uid, uid: USER.uid, productName: 'Netflix Premium',
        productSlug: 'netflix', amount: '1 mois', priceUSD: 0.0, paymentMethod: 'wallet',
        region: 'HT', status: 'Pending Verification', createdAt: 'x',
        // champs financiers forgés qui empoisonneraient la dédup de placeOrder :
        priceCents: 0, balanceAfterCents: 99999999,
      })
    );
  });
});

describe('newsletter_subscribers — capture d\'e-mail (visiteur anonyme)', () => {
  test('OK: visiteur anonyme s\'abonne', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'newsletter_subscribers', 'randy@example.com'), {
        email: 'randy@example.com', createdAt: 'x', lang: 'FR',
      })
    );
  });

  test('REFUS: e-mail mal formé', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'newsletter_subscribers', 'pas-un-email'), { email: 'pas-un-email', createdAt: 'x' })
    );
  });

  test('REFUS: lang hors FR/HT', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'newsletter_subscribers', 'randy@example.com'), {
        email: 'randy@example.com', createdAt: 'x', lang: 'EN',
      })
    );
  });

  test('REFUS: resoumission (même ID) traitée comme update, jamais permise', async () => {
    await seed('newsletter_subscribers/randy@example.com', { email: 'randy@example.com', createdAt: 'x' });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'newsletter_subscribers', 'randy@example.com'), { email: 'randy@example.com', createdAt: 'y' })
    );
  });

  test('REFUS: lecture publique de la liste (pas de scraping des abonnés)', async () => {
    await seed('newsletter_subscribers/randy@example.com', { email: 'randy@example.com', createdAt: 'x' });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'newsletter_subscribers', 'randy@example.com')));
  });

  test('OK: admin (claim) lit un abonné', async () => {
    await seed('newsletter_subscribers/randy@example.com', { email: 'randy@example.com', createdAt: 'x' });
    const db = authedDb(ADMIN, { admin: true });
    await assertSucceeds(getDoc(doc(db, 'newsletter_subscribers', 'randy@example.com')));
  });
});
