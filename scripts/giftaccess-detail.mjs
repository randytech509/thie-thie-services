#!/usr/bin/env node
/**
 * Détail (variations/dénominations + champs requis) des produits GIFT ACCESS mappés.
 * Écrit `scripts/giftaccess-details.json` (local, gitignoré) → pour construire le mapping
 * dénomination thie-thie ↔ variationId GA et l'import.
 *
 * Signature validée (sonde 2026-07-26) : ts secondes, /api/v1 + pathname sans query, hex.
 * USAGE : export GIFTACCESS_API_KEY=... GIFTACCESS_API_SECRET=... ; node scripts/giftaccess-detail.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const KEY = process.env.GIFTACCESS_API_KEY, SECRET = process.env.GIFTACCESS_API_SECRET;
const BASE = (process.env.GIFTACCESS_BASE_URL || 'https://portal.gift-access.com').replace(/\/$/, '');
const PREFIX = '/api/v1';
if (!KEY || !SECRET) { console.error('❌ export GIFTACCESS_API_KEY et GIFTACCESS_API_SECRET.'); process.exit(1); }

// Les 10 produits mappés (voir mémoire giftaccess).
const IDS = {
  '58462': 'Freefire LATAM (Diamonds + Subscriptions)',
  '97707': 'PUBG Mobile',
  '59273': 'Valorant USA',
  '63693': 'Roblox USD',
  '54486': 'Apple USA',
  '47496': 'Google Play USA',
  '79561': 'Playstation USD',
  '21875': 'Xbox USA',
  '96956': 'Steam USD Global',
};

function headers(method, endpoint) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto.createHmac('sha256', SECRET).update(`${ts}${method}${PREFIX}${endpoint.split('?')[0]}`).digest('hex');
  return { 'X-API-KEY': KEY, 'X-API-SIGNATURE': sig, 'X-API-TIMESTAMP': ts, 'Content-Type': 'application/json' };
}
async function get(endpoint) {
  const res = await fetch(`${BASE}${PREFIX}${endpoint}`, { headers: headers('GET', endpoint) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${endpoint} → ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

const run = async () => {
  const details = {};
  for (const [id, label] of Object.entries(IDS)) {
    try {
      const j = await get(`/products/${id}`);
      const p = j.product || j.data || j;
      details[id] = p;
      const vars = p.variations || p.denominations || p.options || [];
      console.log(`\n• ${id}  ${label}`);
      console.log(`   type=${p.type || p.category}  price_type=${p.price_type || '?'}  range=${p.min_amount ?? '-'}..${p.max_amount ?? '-'} ${p.currency || ''}`);
      console.log(`   champs requis: ${JSON.stringify(p.required_fields || p.fields || p.inputs || 'n/a')}`);
      console.log(`   variations (${vars.length}) :`);
      for (const v of vars.slice(0, 30)) {
        console.log(`      - id=${v.id ?? v.variation_id ?? v.code ?? '?'}  ${v.name ?? v.label ?? ''}  prix=${v.price ?? v.amount ?? v.cost ?? '?'} ${v.currency || ''}`);
      }
    } catch (e) {
      console.log(`\n• ${id}  ${label}  ⚠️ ${e.message}`);
      details[id] = { error: e.message };
    }
  }
  fs.writeFileSync('scripts/giftaccess-details.json', JSON.stringify(details, null, 2));
  console.log('\n✅ Détails écrits dans scripts/giftaccess-details.json');
};
run().catch((e) => { console.error('❌', e.message); process.exit(2); });
