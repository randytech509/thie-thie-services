#!/usr/bin/env node
/**
 * Dump du catalogue GIFT ACCESS → fichier local `scripts/giftaccess-catalog.json`.
 * Signature VALIDÉE (sonde 2026-07-26) : ts secondes, path complet /api/v1/..., hex, query non signé.
 *
 * SÉCURITÉ : clé/secret en ENV, jamais loggés ; que des GET (lecture). Le JSON produit est LOCAL
 * (à gitignorer) et sert à construire le mapping des produits manuels → IDs GIFT ACCESS.
 *
 * USAGE :
 *   export GIFTACCESS_API_KEY="..."; export GIFTACCESS_API_SECRET="..."
 *   node scripts/giftaccess-catalog-dump.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const KEY = process.env.GIFTACCESS_API_KEY, SECRET = process.env.GIFTACCESS_API_SECRET;
const BASE = (process.env.GIFTACCESS_BASE_URL || 'https://portal.gift-access.com').replace(/\/$/, '');
const PREFIX = '/api/v1';
if (!KEY || !SECRET) { console.error('❌ export GIFTACCESS_API_KEY et GIFTACCESS_API_SECRET d’abord.'); process.exit(1); }

function headers(method, endpoint) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const pathname = endpoint.split('?')[0];
  const sig = crypto.createHmac('sha256', SECRET).update(`${ts}${method}${PREFIX}${pathname}`).digest('hex');
  return { 'X-API-KEY': KEY, 'X-API-SIGNATURE': sig, 'X-API-TIMESTAMP': ts, 'Content-Type': 'application/json' };
}

async function get(endpoint) {
  const res = await fetch(`${BASE}${PREFIX}${endpoint}`, { headers: headers('GET', endpoint) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${endpoint} → ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

const LIMIT = 100;
const all = new Map();

const run = async () => {
  console.log('📥 Récupération du catalogue GIFT ACCESS…');
  for (let offset = 0, page = 0; page < 20; offset += LIMIT, page++) {
    const j = await get(`/products?limit=${LIMIT}&offset=${offset}`);
    const items = j.products || j.data || [];
    if (!items.length) break;
    let added = 0;
    for (const p of items) { if (p?.id != null && !all.has(String(p.id))) { all.set(String(p.id), p); added++; } }
    console.log(`  page ${page + 1} (offset ${offset}) : ${items.length} reçus, +${added} nouveaux (total ${all.size})`);
    if (items.length < LIMIT || added === 0) break; // dernière page ou offset non supporté
  }

  const arr = [...all.values()];
  const out = 'scripts/giftaccess-catalog.json';
  fs.writeFileSync(out, JSON.stringify(arr, null, 2));
  console.log(`\n✅ ${arr.length} produits écrits dans ${out}`);

  // Aperçu par type/catégorie pour repérer les jeux (top-up) vs cartes.
  const byType = {};
  for (const p of arr) { const t = p.type || p.category || '?'; byType[t] = (byType[t] || 0) + 1; }
  console.log('   répartition par type :', JSON.stringify(byType));
  const games = arr.filter((p) => /free ?fire|pubg|call of duty|mobile legend|efootball|valorant|robux|blood ?strike|top.?up|diamond|uc\b/i.test(`${p.name} ${p.type} ${p.category}`));
  console.log(`   ~jeux/top-up détectés : ${games.length}`);
  for (const g of games.slice(0, 40)) console.log(`     • ${g.id}  ${g.name}  [${g.type || g.category}]`);
};

run().catch((e) => { console.error('❌', e.message); process.exit(2); });
