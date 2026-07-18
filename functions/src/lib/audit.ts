import { Firestore, FieldValue, Transaction } from 'firebase-admin/firestore';

/**
 * Journal d'audit append-only (`/admin_audit`) sur toute mutation de solde / action admin.
 * Conditions Go-Live : `admin_audit` actif sur toute mutation de solde.
 */
export interface AuditEntry {
  action: string;                 // ex: 'creditWallet', 'placeOrder', 'reviewDeposit:approve'
  actorUid: string;               // qui agit (admin uid, ou 'system')
  targetUid?: string;             // utilisateur impacté
  amountCents?: number;
  meta?: Record<string, unknown>;
}

function payload(e: AuditEntry) {
  return {
    action: e.action,
    actorUid: e.actorUid,
    targetUid: e.targetUid ?? null,
    amountCents: e.amountCents ?? null,
    meta: e.meta ?? {},
    createdAt: FieldValue.serverTimestamp(),
  };
}

/** Écrit une entrée d'audit dans une transaction existante (atomique avec la mutation). */
export function auditInTx(db: Firestore, tx: Transaction, e: AuditEntry): void {
  tx.set(db.collection('admin_audit').doc(), payload(e));
}

/** Écrit une entrée d'audit hors transaction. */
export async function audit(db: Firestore, e: AuditEntry): Promise<void> {
  await db.collection('admin_audit').add(payload(e));
}
