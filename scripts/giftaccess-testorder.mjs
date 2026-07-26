#!/usr/bin/env node
/**
 * Commande TEST sandbox GIFT ACCESS — confirme le format du body POST /orders ET la forme de la
 * réponse (pour figer lib/giftaccess.createOrder + lib/giftaccess-fulfill.interpretOrderResponse).
 * Signature validée (ts s, /api/v1 + pathname sans query, hex). SANDBOX uniquement.
 *
 * USAGE (défaut = Free Fire LATAM 100+10 diamants, la moins chère) :
 *   export GIFTACCESS_API_KEY=...; export GIFTACCESS_API_SECRET=...
 *   node scripts/giftaccess-testorder.mjs                          # top-up : product 58462, variation 88452, userid bidon
 *   node scripts/giftaccess-testorder.mjs --product 63693 --amount 10   # range (Roblox)
 *   node scripts/giftaccess-testorder.mjs --bodymode flat          # si 'fields' est refusé
 *
 * ⚠️ C'est une MUTATION (création de commande sandbox). Débite le solde sandbox (fictif).
 */
import crypto from 'node:crypto';

const KEY = process.env.GIFTACCESS_API_KEY, SECRET = process.env.GIFTACCESS_API_SECRET;
const BASE = (process.env.GIFTACCESS_BASE_URL || 'https://portal.gift-access.com').replace(/\/$/, '');
const PREFIX = '/api/v1';
if (!KEY || !SECRET) { console.error('❌ export GIFTACCESS_API_KEY et GIFTACCESS_API_SECRET.'); process.exit(1); }

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const product = arg('--product', '58462');
const variation = arg('--variation', '88452');
const amount = arg('--amount', null);
const userid = arg('--userid', '123456789');
const reference = arg('--reference', `tts-test-${Date.now()}`); // référence marchand (requise)
const bodymode = arg('--bodymode', 'fields'); // fields | flat

// Corps candidat (à confirmer par la réponse serveur). Le champ variation = 'variation_ref'.
let body;
if (bodymode === 'flat') {
  body = { product_id: product, variation_ref: variation, quantity: 1, reference, userid };
} else {
  body = { product_id: product, variation_ref: variation, quantity: 1, reference, fields: { userid } };
}
if (amount != null) { delete body.variation_ref; body.amount = Number(amount); }

function headers(method, endpoint, bodyStr) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto.createHmac('sha256', SECRET).update(`${ts}${method}${PREFIX}${endpoint.split('?')[0]}${bodyStr}`).digest('hex');
  return {
    'X-API-KEY': KEY, 'X-API-SIGNATURE': sig, 'X-API-TIMESTAMP': ts,
    'Content-Type': 'application/json',
    'Idempotency-Key': `test-${Date.now()}`,
  };
}

const run = async () => {
  const bodyStr = JSON.stringify(body);
  console.log('\n📤 POST /api/v1/orders');
  console.log('   body envoyé :', bodyStr, '\n');
  const res = await fetch(`${BASE}${PREFIX}/orders`, { method: 'POST', headers: headers('POST', '/orders', bodyStr), body: bodyStr });
  const text = await res.text();
  console.log(`   ← HTTP ${res.status}`);
  try { console.log('   ← ' + JSON.stringify(JSON.parse(text), null, 2)); }
  catch { console.log('   ← ' + text.slice(0, 800)); }
  if (!res.ok) {
    console.log('\n🟠 Si le serveur se plaint d’un champ (ex. « variation_id required », « field userid »),');
    console.log('   dis-le moi : j’ajuste le body. Essaie aussi --bodymode flat.');
  } else {
    console.log('\n🟢 Commande acceptée — note l’id + le statut + les champs de livraison (code/pin ou confirmation).');
  }
};
run().catch((e) => { console.error('❌', e.message); process.exit(2); });
