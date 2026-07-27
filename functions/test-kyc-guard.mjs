// Test émulateur du garde KYC dépôts locaux (slice 3b).
// Lancé via: firebase emulators:exec --only firestore "node functions/test-kyc-guard.mjs"
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { localDepositBlockedByKyc, sumCreditedLocalDepositsCents } from './lib/lib/kyc-deposit-guard.js';

initializeApp({ projectId: 'thie-thie-services' });
const db = getFirestore();

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('  OK  ', name); } else { fail++; console.log(' FAIL ', name); } };

async function seed(uid, kyc, deposits) {
  await db.doc(`users/${uid}`).set({ kycStatus: kyc, walletBalanceCents: 0 });
  let i = 0;
  for (const d of deposits) {
    i++;
    await db.doc(`wallet_transactions/${uid}_tx${i}`).set({
      uid, type: 'deposit', direction: 'credit', amountCents: d.cents, status: 'Completed',
      meta: d.provider ? { provider: d.provider } : { method: d.method },
    });
  }
}

// U1 : 4000 HTG déjà déposés (local), KYC none → un dépôt de 500 HTG (total 4500) PASSE
await seed('U1', 'none', [{ method: 'MonCash', cents: 300000 }, { provider: 'NatCash', cents: 100000 }]);
check('sum U1 = 4000 HTG', (await sumCreditedLocalDepositsCents(db, 'U1')) === 400000);
check('U1 +500 (total 4500) NON bloqué', (await localDepositBlockedByKyc(db, 'U1', 'MonCash', 50000)) === false);
check('U1 +1500 (total 5500) BLOQUÉ', (await localDepositBlockedByKyc(db, 'U1', 'MonCash', 150000)) === true);
check('U1 +1500 en Crypto (non local) NON concerné', (await localDepositBlockedByKyc(db, 'U1', 'Crypto', 150000)) === false);

// U2 : même cumul mais KYC approuvé → jamais bloqué
await seed('U2', 'approved', [{ method: 'MonCash', cents: 400000 }]);
check('U2 (KYC ok) +2000 NON bloqué', (await localDepositBlockedByKyc(db, 'U2', 'MonCash', 200000)) === false);

// U3 : cumul exactement au seuil (5000) → pas encore au-delà, donc PASSE ; +1 HTG au-delà BLOQUE
await seed('U3', 'none', [{ method: 'MonCash', cents: 450000 }]);
check('U3 +500 (total EXACT 5000) NON bloqué', (await localDepositBlockedByKyc(db, 'U3', 'NatCash', 50000)) === false);
check('U3 +600 (total 5100) BLOQUÉ', (await localDepositBlockedByKyc(db, 'U3', 'NatCash', 60000)) === true);

console.log(`\nRésultat: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
