// Tests du moteur de tarification (pur, sans I/O) : chaîne de coût fournisseur → prix HTG,
// interprétation de la marge, et estimation du float USDT. Verrouille l'économie décidée
// le 2026-07-18 (vraie marge 15 % ÷0,85, acquisition 142 HTG/USDT, frais crypto 1 %).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computePrice, estimateFunding, PricingError } from '../lib/lib/pricing.js';

const CFG = {
  acquisitionHtgCentsPerUsd: 14200, // 142,00 HTG / USDT
  cryptoDepositBps: 100, // 1 %
  marginBps: 1500, // 15 %
  marginMode: 'margin', // vraie marge sur prix de vente (÷0,85)
  roundToHtgCents: 500, // arrondi aux 5 HTG
};

describe('computePrice — chaîne de coût', () => {
  test('carte $10 remisée -2% : coût et prix de vente exacts', () => {
    const b = computePrice({ faceUsdCents: 1000, discountBps: 200 }, CFG);
    assert.equal(b.wholesaleUsdCents, 980); // 1000 × 0,98
    assert.equal(b.usdtSpentUsdCents, 990); // 980 × 1,01 = 989,8 → arrondi
    assert.equal(b.costHtgCents, 140552); // 989,8 × 142 = 1405,52 HTG
    assert.equal(b.retailHtgCents, 165500); // 1405,52 / 0,85 = 1653,5 → arrondi ↑ 5 HTG
  });

  test('la vraie marge réalisée est bien ~15% du prix de vente (pas 13%)', () => {
    const b = computePrice({ faceUsdCents: 1000, discountBps: 200 }, CFG);
    // Marge réelle entre 15,0% et 15,2% (arrondi aux 5 HTG près).
    assert.ok(b.effectiveMarginBps >= 1500 && b.effectiveMarginBps <= 1520, `effBps=${b.effectiveMarginBps}`);
  });

  test('markup 15% donne une marge réelle plus faible (~13%)', () => {
    const b = computePrice({ faceUsdCents: 1000, discountBps: 200 }, { ...CFG, marginMode: 'markup' });
    assert.ok(b.effectiveMarginBps <= 1330, `effBps=${b.effectiveMarginBps}`);
  });

  test('produit à prix fixe (0% remise) coûte plus cher qu’un remisé', () => {
    const fixed = computePrice({ faceUsdCents: 1000, discountBps: 0 }, CFG);
    const remise = computePrice({ faceUsdCents: 1000, discountBps: 200 }, CFG);
    assert.ok(fixed.costHtgCents > remise.costHtgCents);
    assert.ok(fixed.retailHtgCents >= remise.retailHtgCents);
  });

  test('frais fixes fournisseur pris en compte', () => {
    const sans = computePrice({ faceUsdCents: 1000, discountBps: 0 }, CFG);
    const avec = computePrice({ faceUsdCents: 1000, discountBps: 0, fixedFeeUsdCents: 50 }, CFG);
    assert.ok(avec.costHtgCents > sans.costHtgCents);
  });

  test('rejette une marge ≥ 100% en mode margin', () => {
    assert.throws(() => computePrice({ faceUsdCents: 1000 }, { ...CFG, marginBps: 10000 }), PricingError);
  });

  test('rejette un face value non entier', () => {
    assert.throws(() => computePrice({ faceUsdCents: 10.5 }, CFG), PricingError);
  });
});

describe('estimateFunding — float USDT initial', () => {
  test('somme wholesale + frais crypto sur un stock cible', () => {
    const faces = [500, 1000, 2500, 5000, 10000]; // $5..$100
    const lines = faces.map((f) => ({ cost: { faceUsdCents: f, discountBps: 200 }, qty: 1 }));
    const est = estimateFunding(lines, CFG);
    // Σ face = $190 → wholesale -2% = $186,20 → ×1,01 ≈ $188,07 (arrondi par article)
    assert.equal(est.usdtToDepositUsdCents, 18807);
    // Capital HTG = USDT × 142
    assert.ok(est.htgCapitalCents > 0 && est.htgCapitalCents < est.retailHtgCents);
    // Marge projetée = CA − coût > 0
    assert.equal(est.projectedMarginHtgCents, est.retailHtgCents - est.htgCapitalCents);
  });

  test('quantités multiples : linéaire', () => {
    const one = estimateFunding([{ cost: { faceUsdCents: 1000, discountBps: 200 }, qty: 1 }], CFG);
    const ten = estimateFunding([{ cost: { faceUsdCents: 1000, discountBps: 200 }, qty: 10 }], CFG);
    assert.equal(ten.usdtToDepositUsdCents, one.usdtToDepositUsdCents * 10);
  });
});
