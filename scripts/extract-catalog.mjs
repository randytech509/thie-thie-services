// Régénère functions/src/data/catalog.data.ts depuis le catalogue codé en dur de src/App.tsx.
// Usage : node scripts/extract-catalog.mjs   (depuis la racine du projet)
import fs from 'node:fs';
const src = fs.readFileSync('src/App.tsx', 'utf8');
const arrStart = src.indexOf('[', src.indexOf('const PRODUCTS: Product[] = '));
const end = src.indexOf('\n];', arrStart);
let arrText = src.slice(arrStart, end) + '\n]';
const imgMap = {
  freeFireCategoryBanner: 'free_fire_category_banner_1782736851764.jpg',
  pubgOvergrownHelmet: 'pubg_mobile_helmet_overgrown.jpg',
  meruOgImage: 'meru_og_image.png',
  freeFire3DHero: 'free_fire_3d_gamer_hero_1782735072162.jpg',
};
arrText = arrText.replace(/image:\s*([a-zA-Z0-9]+)/g, (m, id) => `image: ${JSON.stringify(imgMap[id] || id)}`);
const PRODUCTS = eval(arrText);
const requiresPid = (c) => ['free-fire','pubg','valorant','mobile-legends','efootball','cod-mobile','robux'].includes(c);
const FX = 145; // priceUSD = prix HTG / 145 → priceCents = round(priceUSD * FX * 100)
const variants = [];
let sort = 0;
for (const p of PRODUCTS) for (const [i, o] of p.options.entries()) variants.push({
  id: `${p.id}__${i}`, productId: p.id, name: p.name, category: p.categorySlug, optionLabel: o.amount,
  priceCents: Math.round(o.priceUSD * FX * 100), currency: 'HTG', stock: 999,
  available: p.stockStatus === 'instock', image: p.image, regions: p.regions,
  requiresPlayerId: requiresPid(p.categorySlug), deliveryTime: p.deliveryTime,
  descriptionFR: p.descriptionFR, descriptionHT: p.descriptionHT, rating: p.rating,
  isPromo: !!p.isPromo, discountBadge: p.discountBadge || null, sortIndex: sort++,
});
const out = `// GÉNÉRÉ depuis src/App.tsx (catalogue) — source du seed Firestore \`products\`.
// Ne pas éditer à la main : régénérer via \`node scripts/extract-catalog.mjs\`.
export interface CatalogVariant {
  id: string; productId: string; name: string; category: string; optionLabel: string;
  priceCents: number; currency: 'HTG'; stock: number; available: boolean; image: string;
  regions: string[]; requiresPlayerId: boolean; deliveryTime: string;
  descriptionFR: string; descriptionHT: string; rating: number; isPromo: boolean;
  discountBadge: string | null; sortIndex: number;
}
export const CATALOG_VARIANTS: CatalogVariant[] = ${JSON.stringify(variants, null, 2)};
`;
fs.mkdirSync('functions/src/data', { recursive: true });
fs.writeFileSync('functions/src/data/catalog.data.ts', out);
console.log(`OK — ${PRODUCTS.length} produits → ${variants.length} variantes`);
