import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAdmin, callOpts } from './lib/guards';
import { requireStepUp } from './lib/stepup';
import { audit } from './lib/audit';

/**
 * Configuration métier serveur-only (config/fx, config/depositAccounts) — écrite EXCLUSIVEMENT
 * par ces callables admin (firestore.rules interdit toute écriture client sur /config).
 * `setFxRate` permet à l'admin de mettre à jour le taux HTG/USD quand le marché bouge.
 */

export const setFxRate = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const htgCentsPerUsd = Number(req.data?.htgCentsPerUsd);
  if (!Number.isInteger(htgCentsPerUsd) || htgCentsPerUsd <= 0) {
    throw new HttpsError('invalid-argument', 'htgCentsPerUsd doit être un entier > 0 (centimes HTG pour 1 USD)');
  }
  const db = getFirestore();
  await requireStepUp(db, admin.uid);
  await db.doc('config/fx').set(
    { htgCentsPerUsd, updatedAt: new Date().toISOString(), updatedBy: admin.uid },
    { merge: true },
  );
  await audit(db, { action: 'setFxRate', actorUid: admin.uid, meta: { htgCentsPerUsd } });
  return { ok: true, htgCentsPerUsd };
});

const DEPOSIT_FIELDS = ['moncashName', 'moncashNumber', 'natcashName', 'natcashNumber', 'binancePayId', 'paypalEmail'] as const;

export const setDepositAccounts = onCall(callOpts, async (req) => {
  const admin = requireAdmin(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const missing = DEPOSIT_FIELDS.filter((k) => typeof d[k] !== 'string' || !(d[k] as string).trim());
  if (missing.length) throw new HttpsError('invalid-argument', `Champs manquants/invalides : ${missing.join(', ')}`);
  const data = Object.fromEntries(DEPOSIT_FIELDS.map((k) => [k, String(d[k]).trim()]));
  const db = getFirestore();
  await requireStepUp(db, admin.uid);
  await db.doc('config/depositAccounts').set(data);
  await audit(db, { action: 'setDepositAccounts', actorUid: admin.uid });
  return { ok: true };
});
