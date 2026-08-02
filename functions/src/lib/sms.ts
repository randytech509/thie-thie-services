/**
 * Parsing des SMS de confirmation MonCash / NatCash (approche « SMS hook » : une app sur le
 * téléphone marchand lit le SMS entrant et le POST vers le webhook `ingestSms`).
 *
 * ⚠️ Les gabarits exacts varient selon l'opérateur/la langue → les regex ci-dessous sont
 * volontairement tolérantes et doivent être ajustées sur un VRAI SMS (cf. tests). Le rapprochement
 * exige de toute façon un txId + montant concordant avant tout auto-crédit (sinon repli manuel).
 */

export type SmsProvider = 'MonCash' | 'NatCash';
export type SmsDirection = 'in' | 'out' | 'other'; // reçu / envoyé / bruit (promo, OTP…)

export interface ParsedSms {
  provider: SmsProvider;
  direction: SmsDirection;     // SEUL 'in' peut créditer un dépôt
  amountCents: number | null;  // centimes HTG (montant de la transaction, pas le solde)
  txId: string | null;         // référence de transaction (idempotence)
  sender: string | null;       // numéro de l'expéditeur
  senderName: string | null;   // nom de l'expéditeur (si présent)
  balanceCents: number | null; // solde du compte marchand après opération (contexte)
  raw: string;
  /** Sens NON reconnu alors que le SMS porte un txId FORT et un montant : gabarit inconnu ou
   *  texte abîmé. Ne crédite rien (la direction reste 'other') mais doit remonter à l'admin
   *  au lieu d'être rangé avec le bruit — cf. `webhooks.ts`. */
  suspectUnclassified?: boolean;
}

/**
 * Texte comparable : accents décomposés puis retirés (« reçu » → « recu », « transféré » →
 * « transfere »). Le téléphone marchand renvoie le même SMS avec des accents plus ou moins
 * abîmés selon l'encodage — travailler sans accent supprime cette variable des regex de sens.
 * `ParsedSms.raw` conserve TOUJOURS le texte d'origine (c'est lui qu'affiche le journal).
 */
function normalizeSmsText(text: string): string {
  return String(text || '').normalize('NFKD').replace(/\p{M}+/gu, '');
}

/** Bruit à écarter AVANT toute autre règle : un OTP cite volontiers l'opération qu'il confirme
 *  (« Saisissez OTP pour confirmer le transfert de 40,000.00 HTG ») et se retrouvait classé
 *  'out' AVEC le montant — une fausse ligne de sortie dans le journal. « Renvoyer otp » tombait
 *  dans le même piège via le fragment « envoy ». */
const NOISE_RE = /\botp\b|ne pas fournir|do not provide/i;

/** Argent ENTRANT. Le « ç » de « reçu » nous parvient corrompu de façons variées selon le SMS
 *  (« re??u », « reC§u »…) : on tolère jusqu'à 2 caractères quelconques à sa place, mais
 *  UNIQUEMENT précédé de « vous avez / you / ou / nou » ou suivi d'un montant en gourdes —
 *  sans ce garde-fou, « rendu » ou « revenu » passeraient pour un encaissement. */
const IN_RE = new RegExp([
  '\\b(?:vous\\s+avez|you|nou|ou|w)\\s+re\\S{0,2}u\\b',
  '\\bre\\S{0,2}u\\s+[\\d][\\d.,\\s]*\\s*(?:HTG|Gourdes?|Goud|G)\\b',
  '\\breceived\\b',
  '\\bresev[we]',
  '\\bencaisse',
].join('|'), 'i');

/** Argent SORTANT. Bornes `\b` obligatoires sur « envoy » (sinon « R-envoy-er ») ; « recharg »
 *  et « deduit » couvrent les achats de crédit/forfait, qui débitent bien le compte marchand. */
const OUT_RE = /\btransfer|\bretire|\benvoy|\bvoye\b|\bsent\b|\bdebit|\brecharg|\bdeduit\b/i;

/** Sens : 'in' (reçu), 'out' (transféré/retiré/envoyé), 'other' (promo, OTP, notif).
 *  « encaisse/encaissé » = dépôt CASH d'un client via un agent/marchand vers le compte marchand
 *  → c'est de l'argent ENTRANT (au même titre qu'un transfert « reçu »), pas du bruit. */
export function parseDirection(text: string): SmsDirection {
  const t = normalizeSmsText(text);
  if (NOISE_RE.test(t)) return 'other';
  if (IN_RE.test(t)) return 'in';
  if (OUT_RE.test(t)) return 'out';
  return 'other';
}

/** Nom de l'expéditeur : après « de … » (FR) ou « nan … » (créole) jusqu'au numéro. */
export function parseSenderName(text: string): string | null {
  const m = text.match(/\b(?:de|nan)\s+(\p{Lu}[\p{L}'’.\- ]*?)(?:\s*,|\s+(?:\+?509[\s-]?)?\d{4,})/u);
  return m ? m[1].trim() : null;
}

/** Solde du compte marchand : « Votre solde / Your balance : X HTG ». */
export function parseBalanceCents(text: string): number | null {
  const m = text.match(/(?:solde|balans|balance)\s*(?:ou)?\s*:?\s*([\d][\d.,\s]*\d|\d)\s*(?:HTG|Gourdes?|Goud|\bG\b)/i);
  return m ? normalizeAmount(m[1]) : null;
}

/**
 * Montant HTG → centimes (entier). Gère la devise AVANT ("G1,100.00", "HTG 500") ou APRÈS
 * ("1,500 HTG", "45.5 Gourdes") le nombre, et l'ambiguïté virgule (milliers vs décimale) :
 *   - '.' ET ',' présents → ',' = séparateur de milliers ("1,100.00" → 1100.00)
 *   - ',' seule suivie de 3 chiffres → milliers ("1,500" → 1500) ; sinon décimale ("1 000,50" → 1000.50)
 */
function normalizeAmount(raw: string): number | null {
  let s = raw.replace(/\s/g, '');
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/,/g, '');                                  // "1,100.00" → virgule = milliers
  } else if (s.includes(',')) {
    const frac = s.split(',')[1] ?? '';
    s = frac.length === 3 ? s.replace(/,/g, '') : s.replace(',', '.'); // "1,500"→1500 ; "1000,50"→1000.50
  }
  const val = Number(s);
  if (!Number.isFinite(val) || val < 0) return null;
  return Math.round(val * 100);
}

export function parseHtgAmountToCents(text: string): number | null {
  return parseAmount(text).cents;
}

/** `fromBalance` : aucun montant de TRANSACTION trouvé, on a dû se rabattre sur le solde du
 *  compte (« Votre solde: 2,369.12 HTG »). Le montant reste exploité pour l'affichage, mais il
 *  ne prouve pas qu'il s'agit d'un mouvement — cf. `suspectUnclassified` dans `parseSms`. */
function parseAmount(text: string): { cents: number | null; fromBalance: boolean } {
  // Tous les montants avec devise (devant OU derrière le nombre)
  const re = /(?:HTG|Gourdes?|Goud|G)\s*([\d][\d.,\s]*\d|\d)|([\d][\d.,\s]*\d|\d)\s*(?:HTG|Gourdes?|Goud|\bG\b)/gi;
  // On IGNORE tout montant précédé de « solde / balance » (= le solde du compte, pas la transaction)
  const isBalanceBefore = /(solde|balans|balance|\bbal\b)[^\d]{0,10}$/i;

  const found: { num: string; balance: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const num = m[1] ?? m[2];
    const before = text.slice(Math.max(0, m.index - 18), m.index);
    found.push({ num, balance: isBalanceBefore.test(before) });
  }
  const pick = found.find((f) => !f.balance) ?? found[0];
  return { cents: pick ? normalizeAmount(pick.num) : null, fromBalance: pick ? pick.balance : false };
}

/**
 * Référence de transaction : après "TransCode/Txn ID/transaction/référence/#"…
 *
 * PRIORITÉ AUX RÉFÉRENCES FORTES. Dans un SMS de dépôt agent — « Vous avez encaisse 2 000 HTG …
 * de X, code 347386. … TransCode: 26072343604240. » — DEUX identifiants coexistent : le « code »
 * agent (COURT, ~6 chiffres, devinable) et le « TransCode » (long, non devinable). On ne doit
 * JAMAIS auto-créditer sur le code agent : on prend d'abord le TransCode / Txn ID / transaction /
 * référence, et le « code » nu ou « # » n'est qu'un dernier recours pour les formats qui n'ont
 * que ça. (Sécurité : la clé d'auto-crédit doit être imprévisible — cf. deposit-reconcile.ts.)
 */
function parseStrongTxId(text: string): string | null {
  const m = text.match(/(?:transcode|transaction|tranzaksyon|txn(?:\s*id)?|r[ée]f[ée]rence|\bref\b|confirmation)\s*(?:no\.?|n[o°]?|#|id|:|=)*\s*([A-Za-z0-9]{5,})/i);
  return m ? m[1].toUpperCase() : null;
}

export function parseTxId(text: string): string | null {
  const strong = parseStrongTxId(text);
  if (strong) return strong;
  const weak = text.match(/\bcode\s*(?:no\.?|n[o°]?|#|:|=)*\s*([A-Za-z0-9]{5,})/i) || text.match(/#\s*([A-Za-z0-9]{5,})/);
  return weak ? weak[1].toUpperCase() : null;
}

/** Numéro d'expéditeur haïtien (509 + 8 chiffres) ou séquence de 8 chiffres.
 *  Bornes `(?<!\d)…(?!\d)` : la tranche de 8 chiffres ne doit PAS être collée à d'autres
 *  chiffres, sinon un dépôt agent sans numéro (« … TransCode: 26072343604240 ») verrait ses
 *  8 premiers chiffres de TransCode fabriqués en faux numéro d'expéditeur. Le garde est placé
 *  avant le préfixe 509 pour accepter aussi un numéro collé « 509XXXXXXXX ». */
export function parseSender(text: string): string | null {
  const m = text.match(/(?<!\d)(?:\+?509[\s-]?)?(\d{4}[\s-]?\d{4})(?!\d)/);
  return m ? m[1].replace(/[\s-]/g, '') : null;
}

export function parseSms(provider: SmsProvider, raw: string): ParsedSms {
  const text = String(raw || '');
  const direction = parseDirection(text);
  const amount = parseAmount(text);
  // Filet indépendant des regex de sens : un SMS porteur d'un txId FORT et d'un montant de
  // TRANSACTION est un mouvement, jamais du bruit. Si son sens n'est pas reconnu, c'est un gabarit
  // nouveau (ou un texte abîmé) — on le signale au lieu de le laisser disparaître dans les
  // « ignorés ». Un simple relevé de solde (`fromBalance`) ne déclenche pas l'alerte.
  const suspectUnclassified =
    direction === 'other' && amount.cents != null && !amount.fromBalance && parseStrongTxId(text) != null;
  return {
    provider,
    direction,
    amountCents: amount.cents,
    txId: parseTxId(text),
    sender: parseSender(text),
    senderName: parseSenderName(text),
    balanceCents: parseBalanceCents(text),
    raw: text,
    suspectUnclassified,
  };
}
