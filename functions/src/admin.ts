import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAuth, callOpts } from './lib/guards';
import { audit } from './lib/audit';

/**
 * Attribue/révoque le custom claim `admin` (invariant 6 : seule source d'autorité admin).
 *
 * Bootstrap du 1er admin (problème de l'œuf et la poule) : un appelant dont l'email figure
 * dans FUNCTIONS_BOOTSTRAP_ADMIN_EMAILS (CSV) peut promouvoir, même sans être encore admin.
 * Ensuite, seuls les admins existants peuvent gérer les rôles.
 * ⚠️ Définir FUNCTIONS_BOOTSTRAP_ADMIN_EMAILS via Secret Manager / config, jamais en dur.
 */
/**
 * Attribue/révoque le claim `smsForwarder` — le droit de soumettre des SMS au webhook, et
 * RIEN d'autre.
 *
 * Pourquoi un claim dédié plutôt que de réutiliser un compte existant : le téléphone marchand
 * porte une session en permanence, dans un lieu passant. Si ce compte pouvait aussi commander,
 * consulter un solde ou administrer, un vol de téléphone donnerait tout cela. Ici il ne donne
 * que la capacité de soumettre un SMS — que le rapprochement strict (txId + montant + sens)
 * refusera de toute façon s'il ne concorde pas.
 *
 * Un compte PAR APPAREIL : deux téléphones, deux comptes, révocables séparément sans couper
 * l'autre. Désactiver le compte dans la console suffit à neutraliser un appareil perdu.
 */
export const setSmsForwarderRole = onCall(callOpts, async (req) => {
  const actor = requireAuth(req);
  const targetUid = String(req.data?.uid ?? '');
  const grant = req.data?.forwarder === true;
  if (!targetUid) throw new HttpsError('invalid-argument', 'uid cible requis');
  if (req.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'réservé aux administrateurs');
  }

  const auth = getAuth();
  const user = await auth.getUser(targetUid);
  const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
  if (grant) claims.smsForwarder = true;
  else delete claims.smsForwarder;
  await auth.setCustomUserClaims(targetUid, claims);

  await audit(getFirestore(), {
    action: grant ? 'setSmsForwarderRole:grant' : 'setSmsForwarderRole:revoke',
    actorUid: actor.uid,
    targetUid,
  });
  return { ok: true, uid: targetUid, smsForwarder: grant };
});

export const setAdminRole = onCall(callOpts, async (req) => {
  const actor = requireAuth(req);
  const targetUid = String(req.data?.uid ?? '');
  const makeAdmin = req.data?.admin === true;
  if (!targetUid) throw new HttpsError('invalid-argument', 'uid cible requis');

  const callerIsAdmin = req.auth?.token?.admin === true;
  const bootstrap = (process.env.FUNCTIONS_BOOTSTRAP_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const callerEmail = String(req.auth?.token?.email ?? '').toLowerCase();
  const callerIsBootstrap = callerEmail.length > 0 && bootstrap.includes(callerEmail);

  if (!callerIsAdmin && !callerIsBootstrap) {
    throw new HttpsError('permission-denied', 'réservé aux administrateurs');
  }

  const auth = getAuth();
  const user = await auth.getUser(targetUid);
  const claims = { ...(user.customClaims ?? {}), admin: makeAdmin };
  if (!makeAdmin) delete (claims as Record<string, unknown>).admin;
  await auth.setCustomUserClaims(targetUid, claims);

  await audit(getFirestore(), {
    action: makeAdmin ? 'setAdminRole:grant' : 'setAdminRole:revoke',
    actorUid: actor.uid,
    targetUid,
    meta: { bootstrap: callerIsBootstrap && !callerIsAdmin },
  });

  // Le client doit rafraîchir son ID token (getIdToken(true)) pour voir le nouveau claim.
  return { ok: true, uid: targetUid, admin: makeAdmin };
});
