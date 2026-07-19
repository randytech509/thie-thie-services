import { httpsCallable } from 'firebase/functions';
import { functionsClient } from '../firebase';

/**
 * Wrappers des Cloud Functions callables — UNIQUE chemin par lequel la SPA déclenche
 * une mutation financière (invariant 3). Le client n'écrit jamais un solde en direct.
 */

export interface ReviewDepositInput {
  requestId: string;
  decision: 'approve' | 'reject';
}
export interface ReviewDepositResult {
  ok: boolean;
  status: 'Completed' | 'Rejected';
  balanceAfterCents?: number;
  deduped?: boolean;
}
export async function reviewDeposit(input: ReviewDepositInput): Promise<ReviewDepositResult> {
  const fn = httpsCallable<ReviewDepositInput, ReviewDepositResult>(functionsClient, 'reviewDeposit');
  return (await fn(input)).data;
}

export interface PlaceOrderInput {
  productId: string;
  quantity?: number;
  /** ID idempotent fourni par le client (ex: crypto.randomUUID()) — dédupe le double-achat. */
  idempotencyKey: string;
  /** Métadonnées de livraison (sans effet sur le prix — résolu serveur). */
  playerId?: string;
  region?: string;
  optionLabel?: string;
}
export interface PlaceOrderResult {
  ok: boolean;
  orderId: string;
  totalCents: number;
  balanceAfterCents: number;
  pointsEarned: number;
  deduped: boolean;
}
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const fn = httpsCallable<PlaceOrderInput, PlaceOrderResult>(functionsClient, 'placeOrderCallable');
  return (await fn(input)).data;
}

export interface RedeemRewardInput {
  rewardId: string;
  /** ID idempotent du coupon (ex: crypto.randomUUID()) — dédupe la double-rédemption. */
  idempotencyKey: string;
}
export interface RedeemRewardResult {
  ok: boolean;
  couponId: string;
  code: string;
  cost: number;
  pointsAfter: number;
  deduped: boolean;
}
export async function redeemReward(input: RedeemRewardInput): Promise<RedeemRewardResult> {
  const fn = httpsCallable<RedeemRewardInput, RedeemRewardResult>(functionsClient, 'redeemReward');
  return (await fn(input)).data;
}

export interface ReviewKycInput {
  requestId: string;
  decision: 'approve' | 'reject';
  reason?: string;
}
export interface ReviewKycResult {
  ok: boolean;
  status: 'approved' | 'rejected';
}
export async function reviewKyc(input: ReviewKycInput): Promise<ReviewKycResult> {
  const fn = httpsCallable<ReviewKycInput, ReviewKycResult>(functionsClient, 'reviewKyc');
  return (await fn(input)).data;
}

export interface CreateCryptoInvoiceInput {
  amountUsd: number;
}
export interface CreateCryptoInvoiceResult {
  requestId: string;
  paymentUrl: string;
  trackId: string;
  expiresAt: number;
  amountUsd: number;
  amountHtgCents: number;
}
/** Réservé aux comptes kycStatus === 'approved' — vérifié SERVEUR (permission-denied sinon). */
export async function createCryptoInvoice(input: CreateCryptoInvoiceInput): Promise<CreateCryptoInvoiceResult> {
  const fn = httpsCallable<CreateCryptoInvoiceInput, CreateCryptoInvoiceResult>(functionsClient, 'createCryptoInvoice');
  return (await fn(input)).data;
}

export interface SetAdminRoleInput {
  uid: string;
  admin: boolean;
}
export interface SetAdminRoleResult {
  ok: boolean;
  uid: string;
  admin: boolean;
}
export async function setAdminRole(input: SetAdminRoleInput): Promise<SetAdminRoleResult> {
  const fn = httpsCallable<SetAdminRoleInput, SetAdminRoleResult>(functionsClient, 'setAdminRole');
  return (await fn(input)).data;
}

export interface FulfillOrderInput {
  orderId: string;
  code: string;
  instructions?: string;
}
export interface FulfillOrderResult {
  ok: boolean;
  emailSent: boolean;
  error?: string | null;
}
/** Livraison admin : enregistre le code + envoie l'e-mail au client (fulfillOrder). */
export async function fulfillOrder(input: FulfillOrderInput): Promise<FulfillOrderResult> {
  const fn = httpsCallable<FulfillOrderInput, FulfillOrderResult>(functionsClient, 'fulfillOrder');
  return (await fn(input)).data;
}

/** Admin : met à jour le taux de change (config/fx). */
export async function setFxRate(input: { htgCentsPerUsd: number }): Promise<{ ok: boolean; htgCentsPerUsd: number }> {
  const fn = httpsCallable<typeof input, { ok: boolean; htgCentsPerUsd: number }>(functionsClient, 'setFxRate');
  return (await fn(input)).data;
}

/** Admin : met à jour les coordonnées de dépôt (config/depositAccounts). */
export async function setDepositAccounts(input: Record<string, string>): Promise<{ ok: boolean }> {
  const fn = httpsCallable<Record<string, string>, { ok: boolean }>(functionsClient, 'setDepositAccounts');
  return (await fn(input)).data;
}

/** Admin : envoie une notification push à tous les utilisateurs abonnés. */
export async function sendBroadcastPush(input: { title: string; body: string; imageUrl?: string; url?: string }): Promise<{ ok: boolean; sent: number; failed: number; tokens: number }> {
  const fn = httpsCallable<typeof input, { ok: boolean; sent: number; failed: number; tokens: number }>(functionsClient, 'sendBroadcastPush');
  return (await fn(input)).data;
}

/** Admin : crée/met à jour une page promo HTML. */
export async function savePromo(input: { id?: string; title: string; html: string; published: boolean }): Promise<{ ok: boolean; id: string; slug: string }> {
  const fn = httpsCallable<typeof input, { ok: boolean; id: string; slug: string }>(functionsClient, 'savePromo');
  return (await fn(input)).data;
}

/** Admin : supprime une page promo. */
export async function deletePromo(input: { id: string }): Promise<{ ok: boolean }> {
  const fn = httpsCallable<typeof input, { ok: boolean }>(functionsClient, 'deletePromo');
  return (await fn(input)).data;
}

/** Admin : solde du fournisseur Reloadly. */
export async function reloadlyBalance(): Promise<{ configured: boolean; balance?: number; currencyCode?: string }> {
  return (await httpsCallable<Record<string, never>, any>(functionsClient, 'reloadlyBalance')({})).data;
}

/** Admin : recherche produits Reloadly. */
export async function reloadlyFindProducts(input: { query: string }): Promise<{ total: number; products: any[] }> {
  return (await httpsCallable<typeof input, any>(functionsClient, 'reloadlyFindProducts')(input)).data;
}

/** Admin : mappe un produit du catalogue à un produit Reloadly. */
export async function setProductSupplier(input: { productId: string; reloadlyProductId?: number; reloadlyCountryCode?: string; reloadlyUnitPrice?: number; autoFulfill: boolean }): Promise<{ ok: boolean }> {
  return (await httpsCallable<typeof input, any>(functionsClient, 'setProductSupplier')(input)).data;
}
