import { useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { reviewDeposit, reviewKyc, fulfillOrder, setFxRate, setDepositAccounts, sendBroadcastPush, savePromo, deletePromo, reloadlyBalance, reloadlyFindProducts, setProductSupplier, setPricingConfig, setProductCost, reloadlyImportCatalog, estimateFunding, setProductInventory, deleteProduct, clearImportedProducts, type PricingConfig } from '../lib/api';
import { getPasskeyStatus, enrollPasskey, verifyPasskey } from '../lib/passkey';
import {
  LayoutDashboard, ShoppingBag, Wallet, ShieldCheck, Bell, Settings, KeyRound,
  Check, X, Loader2, Mail, ChevronLeft, Fingerprint, Send, Trash2, ExternalLink, ImagePlus, Boxes, Calculator, DownloadCloud, RefreshCw, Coins,
} from 'lucide-react';

interface AdminPanelProps {
  user: FirebaseUser;
  navigateToPage: (page: any) => void;
  formatPrice?: (priceUSD: number) => string;
}

type Tab = 'dashboard' | 'orders' | 'deposits' | 'kyc' | 'notifications' | 'supplier' | 'pricing' | 'settings' | 'security';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'orders', label: 'Commandes', icon: ShoppingBag },
  { id: 'deposits', label: 'Dépôts', icon: Wallet },
  { id: 'kyc', label: 'KYC', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'supplier', label: 'Fournisseur', icon: Boxes },
  { id: 'pricing', label: 'Tarification', icon: Calculator },
  { id: 'settings', label: 'Paramètres', icon: Settings },
  { id: 'security', label: 'Sécurité', icon: KeyRound },
];

const htg = (cents: number) => `${Math.round((cents || 0) / 100).toLocaleString()} HTG`;

export function AdminPanel({ user, navigateToPage }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [orders, setOrders] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [kyc, setKyc] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Livraison commande
  const [fx, setFx] = useState<any | null>(null);
  const [fxCode, setFxCode] = useState('');
  const [fxInstr, setFxInstr] = useState('');

  // Passkey / step-up
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null); // null = en cours
  const [stepUpOk, setStepUpOk] = useState(false);
  const [pkBusy, setPkBusy] = useState(false);
  const [pkMsg, setPkMsg] = useState<string | null>(null);

  useEffect(() => {
    getPasskeyStatus()
      .then((s) => { setHasPasskey(s.hasPasskey); if (!s.hasPasskey) setStepUpOk(true); })
      .catch(() => { setHasPasskey(false); setStepUpOk(true); });
  }, []);

  const doVerifyPasskey = async () => {
    setPkBusy(true); setPkMsg(null);
    try { await verifyPasskey(); setStepUpOk(true); }
    catch (e) { setPkMsg(`Échec : ${(e as Error).message}`); }
    finally { setPkBusy(false); }
  };
  const doEnrollPasskey = async () => {
    setPkBusy(true); setPkMsg(null);
    try { await enrollPasskey(); setHasPasskey(true); setStepUpOk(true); setPkMsg('Passkey enregistré. Il protège désormais l\'accès au back-office.'); }
    catch (e) { setPkMsg(`Échec : ${(e as Error).message}`); }
    finally { setPkBusy(false); }
  };

  useEffect(() => {
    if (!user) return;
    const subs = [
      onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
        (s) => setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}),
      onSnapshot(query(collection(db, 'wallet_requests'), orderBy('createdAt', 'desc')),
        (s) => setDeposits(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}),
      onSnapshot(query(collection(db, 'kyc_requests'), orderBy('createdAt', 'desc')),
        (s) => setKyc(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}),
    ];
    return () => subs.forEach((u) => u());
  }, [user]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const ordersToFulfill = orders.filter((o) => !o.fulfilledAt && !o.deliveryCode);
  const depositsPending = deposits.filter((d) => {
    const s = (d.status || '').toLowerCase();
    return s.includes('pending') || s.includes('await');
  });
  const kycPending = kyc.filter((k) => (k.status || '').toLowerCase() === 'pending');

  const doReviewDeposit = async (requestId: string, decision: 'approve' | 'reject') => {
    setBusy(requestId);
    try { await reviewDeposit({ requestId, decision } as any); flash(`Dépôt ${decision === 'approve' ? 'approuvé' : 'rejeté'}.`); }
    catch (e) { flash(`Échec : ${(e as Error).message}`); } finally { setBusy(null); }
  };
  const doReviewKyc = async (requestId: string, decision: 'approve' | 'reject') => {
    setBusy(requestId);
    try { await reviewKyc({ requestId, decision } as any); flash(`KYC ${decision === 'approve' ? 'approuvé' : 'rejeté'}.`); }
    catch (e) { flash(`Échec : ${(e as Error).message}`); } finally { setBusy(null); }
  };
  const doFulfill = async () => {
    if (!fx || !fxCode.trim()) return;
    setBusy('fulfill');
    try {
      const r = await fulfillOrder({ orderId: fx.orderId || fx.id, code: fxCode.trim(), instructions: fxInstr.trim() || undefined });
      flash(r.emailSent ? 'Code livré et e-mail envoyé.' : `Code enregistré, e-mail NON envoyé : ${r.error}`);
      setFx(null); setFxCode(''); setFxInstr('');
    } catch (e) { flash(`Échec : ${(e as Error).message}`); } finally { setBusy(null); }
  };

  // Écran de step-up : un passkey est enregistré mais pas encore vérifié cette session.
  // (Le serveur applique de toute façon requireStepUp sur les actions sensibles.)
  if (hasPasskey === null) {
    return <div className="min-h-screen bg-[var(--tt-bg)] text-white flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#a855f7]" /></div>;
  }
  if (hasPasskey && !stepUpOk) {
    return (
      <div className="min-h-screen bg-[var(--tt-bg)] text-white flex items-center justify-center p-4">
        <div className="bg-[var(--tt-surface)] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#a855f7]/15 flex items-center justify-center"><Fingerprint className="w-7 h-7 text-[#a855f7]" /></div>
          <div>
            <h1 className="text-xl font-black">Back-office protégé</h1>
            <p className="text-sm text-white/50 mt-1">Vérifie ton identité avec ton passkey pour continuer.</p>
          </div>
          {pkMsg && <p className="text-xs font-bold text-red-400">{pkMsg}</p>}
          <button onClick={doVerifyPasskey} disabled={pkBusy} className="w-full bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black uppercase text-sm rounded-xl py-3 flex items-center justify-center gap-2">
            {pkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />} Déverrouiller
          </button>
          <button onClick={() => navigateToPage('home')} className="text-xs text-white/40 hover:text-white">Retour au site</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--tt-bg)] text-white flex flex-col lg:flex-row">
      {/* Nav onglets */}
      <aside className="lg:w-60 shrink-0 border-b lg:border-b-0 lg:border-r border-white/[0.06] bg-[var(--tt-surface)] lg:h-screen lg:sticky lg:top-0 p-3">
        <button onClick={() => navigateToPage('home')} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white mb-3 px-2 py-1">
          <ChevronLeft className="w-4 h-4" /> Retour au site
        </button>
        <h1 className="text-sm font-black px-2 mb-2 text-[#a855f7] uppercase tracking-wider">Back-office</h1>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const badge = t.id === 'orders' ? ordersToFulfill.length : t.id === 'deposits' ? depositsPending.length : t.id === 'kyc' ? kycPending.length : 0;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-bold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-[#a855f7] text-black' : 'text-white/70 hover:bg-white/[0.05]'}`}>
                <Icon className="w-4 h-4" /> {t.label}
                {badge > 0 && <span className={`ml-auto text-[10px] rounded-full px-1.5 ${tab === t.id ? 'bg-black/20' : 'bg-[#a855f7] text-black'}`}>{badge}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 p-4 lg:p-8">
        {toast && <div className="fixed top-6 right-6 z-50 bg-[#1c1030] border border-[#a855f7] rounded-xl px-4 py-3 text-sm font-bold shadow-2xl">{toast}</div>}

        {tab === 'dashboard' && (
          <div>
            <h2 className="text-2xl font-black mb-6">Tableau de bord</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Commandes à livrer', value: ordersToFulfill.length, c: '#a855f7' },
                { label: 'Dépôts en attente', value: depositsPending.length, c: '#8b5cf6' },
                { label: 'KYC en attente', value: kycPending.length, c: '#a78bfa' },
                { label: 'Total commandes', value: orders.length, c: '#10b981' },
              ].map((s) => (
                <div key={s.label} className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-5">
                  <p className="text-3xl font-black tabular-nums" style={{ color: s.c }}>{s.value}</p>
                  <p className="text-xs text-white/50 font-bold mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'orders' && (
          <div>
            <h2 className="text-2xl font-black mb-6">Commandes <span className="text-sm text-white/40">({ordersToFulfill.length} à livrer)</span></h2>
            <div className="flex flex-col gap-3">
              {orders.length === 0 && <p className="text-white/40 text-sm">Aucune commande.</p>}
              {orders.map((o) => (
                <div key={o.id} className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{o.productName || 'Produit'}{o.optionLabel ? ` — ${o.optionLabel}` : ''}</p>
                    <p className="text-[11px] text-white/40 font-mono">{o.orderId || o.id} · {htg(o.priceCents)}{o.playerId ? ` · Player ${o.playerId}` : ''}</p>
                  </div>
                  {o.fulfilledAt || o.deliveryCode ? (
                    <span className="text-[10px] font-black text-emerald-400 shrink-0 flex items-center gap-1"><Check className="w-3 h-3" />Livré{o.emailSent === false ? ' (e-mail KO)' : ''}</span>
                  ) : (
                    <button onClick={() => { setFx(o); setFxCode(''); setFxInstr(''); }} className="shrink-0 bg-[#a855f7] hover:bg-[#b56ff5] text-black text-[11px] font-black uppercase rounded-lg px-3 py-1.5">Livrer</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'deposits' && (
          <div>
            <h2 className="text-2xl font-black mb-6">Dépôts <span className="text-sm text-white/40">({depositsPending.length} en attente)</span></h2>
            <div className="flex flex-col gap-3">
              {depositsPending.length === 0 && <p className="text-white/40 text-sm">Aucun dépôt en attente.</p>}
              {depositsPending.map((d) => (
                <div key={d.id} className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm">{d.amountCents ? htg(d.amountCents) : (d.amount || '—')} · {d.paymentMethod || d.provider || '—'}</p>
                    <p className="text-[11px] text-white/40 font-mono truncate">{d.id}{d.txId ? ` · Tx ${d.txId}` : ''}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button disabled={busy === d.id} onClick={() => doReviewDeposit(d.id, 'approve')} className="bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-black rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-40">{busy === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Approuver</button>
                    <button disabled={busy === d.id} onClick={() => doReviewDeposit(d.id, 'reject')} className="bg-red-500/80 hover:bg-red-500 text-white text-[11px] font-black rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"><X className="w-3 h-3" />Rejeter</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'kyc' && (
          <div>
            <h2 className="text-2xl font-black mb-6">KYC <span className="text-sm text-white/40">({kycPending.length} en attente)</span></h2>
            <div className="flex flex-col gap-3">
              {kycPending.length === 0 && <p className="text-white/40 text-sm">Aucune demande KYC en attente.</p>}
              {kycPending.map((k) => (
                <div key={k.id} className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{k.fullName || k.name || 'Sans nom'}</p>
                    <p className="text-[11px] text-white/40 font-mono truncate">{k.id}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button disabled={busy === k.id} onClick={() => doReviewKyc(k.id, 'approve')} className="bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-black rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-40">{busy === k.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Approuver</button>
                    <button disabled={busy === k.id} onClick={() => doReviewKyc(k.id, 'reject')} className="bg-red-500/80 hover:bg-red-500 text-white text-[11px] font-black rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"><X className="w-3 h-3" />Rejeter</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'settings' && <AdminSettings flash={flash} />}

        {tab === 'notifications' && <AdminNotifications flash={flash} uid={user.uid} />}

        {tab === 'supplier' && <AdminSupplier flash={flash} />}

        {tab === 'pricing' && <AdminPricing flash={flash} />}
        {tab === 'security' && (
          <div className="max-w-lg">
            <h2 className="text-2xl font-black mb-4">Sécurité</h2>
            <div className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#a855f7]/15 flex items-center justify-center"><Fingerprint className="w-5 h-5 text-[#a855f7]" /></div>
                <div>
                  <h3 className="font-black text-sm">Passkey (WebAuthn)</h3>
                  <p className="text-[11px] text-white/50">{hasPasskey ? 'Actif — le back-office exige une vérification biométrique.' : 'Aucun passkey. Le back-office n\'est pas encore protégé par step-up.'}</p>
                </div>
                {hasPasskey && <span className="ml-auto text-[10px] font-black text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" />Actif</span>}
              </div>
              <p className="text-[11px] text-white/40 mb-3">Un passkey (empreinte / Face ID, stocké par Google Password Manager, Apple ou 1Password) protège l'accès au back-office et les actions sensibles (livraison, dépôts, KYC, paramètres). Tu peux en enregistrer plusieurs (téléphone + ordinateur).</p>
              {pkMsg && <p className="text-xs font-bold text-[#a855f7] mb-2">{pkMsg}</p>}
              <button onClick={doEnrollPasskey} disabled={pkBusy} className="bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black text-sm rounded-xl px-4 py-2.5 flex items-center gap-2">
                {pkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}{hasPasskey ? 'Ajouter un autre passkey' : 'Enregistrer un passkey'}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modal livraison */}
      {fx && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-md">
          <div className="bg-[var(--tt-surface)] border border-white/10 rounded-3xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-black flex items-center gap-2"><Mail className="w-4 h-4 text-[#a855f7]" />Livrer la commande</h3>
                <p className="text-xs text-white/50 mt-0.5">{fx.productName}{fx.optionLabel ? ` — ${fx.optionLabel}` : ''}</p>
              </div>
              <button onClick={() => setFx(null)} className="p-2 rounded-full bg-black/40 hover:bg-white/10" aria-label="Fermer"><X className="w-4 h-4" /></button>
            </div>
            <input value={fxCode} onChange={(e) => setFxCode(e.target.value)} placeholder="Code / PIN" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm focus:border-[#a855f7] outline-none" />
            <textarea value={fxInstr} onChange={(e) => setFxInstr(e.target.value)} rows={3} placeholder="Instructions d'application (optionnel)" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-[#a855f7] outline-none resize-none" />
            <button onClick={doFulfill} disabled={busy === 'fulfill' || !fxCode.trim()} className="bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black uppercase text-sm rounded-xl py-3">{busy === 'fulfill' ? 'Envoi…' : 'Envoyer le code'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminSettings({ flash }: { flash: (m: string) => void }) {
  const [rate, setRate] = useState('145');
  const [busy, setBusy] = useState(false);
  const [dep, setDep] = useState({ moncashName: '', moncashNumber: '', natcashName: '', natcashNumber: '', binancePayId: '', paypalEmail: '' });

  const saveFx = async () => {
    const htgPerUsd = Math.round(parseFloat(rate) * 100);
    if (!htgPerUsd || htgPerUsd <= 0) { flash('Taux invalide.'); return; }
    setBusy(true);
    try { await setFxRate({ htgCentsPerUsd: htgPerUsd } as any); flash(`Taux mis à jour : 1 USD = ${rate} HTG.`); }
    catch (e) { flash(`Échec : ${(e as Error).message}`); } finally { setBusy(false); }
  };
  const saveDep = async () => {
    setBusy(true);
    try { await setDepositAccounts(dep as any); flash('Coordonnées de dépôt mises à jour.'); }
    catch (e) { flash(`Échec : ${(e as Error).message}`); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-lg flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-black mb-4">Paramètres</h2>
        <div className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-5">
          <h3 className="font-black text-sm mb-1">Taux de change (HTG pour 1 USD)</h3>
          <p className="text-[11px] text-white/40 mb-3">Utilisé pour convertir les prix. Doit rester cohérent avec le catalogue.</p>
          <div className="flex gap-2">
            <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm w-32 focus:border-[#a855f7] outline-none" />
            <button onClick={saveFx} disabled={busy} className="bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black text-sm rounded-xl px-4">Enregistrer</button>
          </div>
        </div>
      </div>
      <div className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-5">
        <h3 className="font-black text-sm mb-3">Coordonnées de dépôt (affichées aux clients)</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['moncashName', 'MonCash — nom'], ['moncashNumber', 'MonCash — numéro'],
            ['natcashName', 'NatCash — nom'], ['natcashNumber', 'NatCash — numéro'],
            ['binancePayId', 'Binance Pay ID'], ['paypalEmail', 'PayPal — e-mail'],
          ].map(([k, label]) => (
            <input key={k} placeholder={label} value={(dep as any)[k]} onChange={(e) => setDep({ ...dep, [k]: e.target.value })}
              className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs focus:border-[#a855f7] outline-none" />
          ))}
        </div>
        <button onClick={saveDep} disabled={busy} className="mt-3 bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black text-sm rounded-xl px-4 py-2.5">Enregistrer les coordonnées</button>
        <p className="text-[10px] text-white/30 mt-2">Laisse un champ vide pour ne pas l'écraser n'est pas supporté — remplis tous les champs.</p>
      </div>
    </div>
  );
}

function AdminNotifications({ flash, uid }: { flash: (m: string) => void; uid: string }) {
  const [promos, setPromos] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [url, setUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith('image/')) { flash('Choisis un fichier image.'); return; }
    if (file.size > 5 * 1024 * 1024) { flash('Image trop lourde (5 Mo max).'); return; }
    setUploadingImg(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const r = ref(storage, `promo_images/${uid}/push-${Date.now()}.${ext}`);
      await uploadBytes(r, file);
      const dl = await getDownloadURL(r);
      setImageUrl(dl);
      flash('Image importée.');
    } catch (e) { flash(`Échec de l'import : ${(e as Error).message}`); }
    finally { setUploadingImg(false); }
  };

  // Éditeur promo
  const [pId, setPId] = useState<string | null>(null);
  const [pTitle, setPTitle] = useState('');
  const [pHtml, setPHtml] = useState('');
  const [pPub, setPPub] = useState(false);
  const [pBusy, setPBusy] = useState(false);

  useEffect(() => {
    return onSnapshot(query(collection(db, 'promos'), orderBy('updatedAt', 'desc')),
      (s) => setPromos(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
  }, []);

  const promoLink = (id: string) => `${window.location.origin}/?promo=${id}`;

  const send = async () => {
    if (!title.trim() || !body.trim()) { flash('Titre et corps requis.'); return; }
    setSending(true);
    try {
      const r = await sendBroadcastPush({ title: title.trim(), body: body.trim(), imageUrl: imageUrl.trim() || undefined, url: url.trim() || undefined });
      flash(`Push envoyé : ${r.sent}/${r.tokens} appareils (${r.failed} échecs).`);
    } catch (e) { flash(`Échec : ${(e as Error).message}`); } finally { setSending(false); }
  };

  const editPromo = (p: any) => { setPId(p.id); setPTitle(p.title || ''); setPHtml(p.html || ''); setPPub(!!p.published); };
  const newPromo = () => { setPId(null); setPTitle(''); setPHtml(''); setPPub(false); };
  const save = async () => {
    if (!pTitle.trim()) { flash('Titre de la promo requis.'); return; }
    setPBusy(true);
    try {
      const r = await savePromo({ id: pId || undefined, title: pTitle.trim(), html: pHtml, published: pPub });
      flash('Page promo enregistrée.'); setPId(r.id);
      setUrl(promoLink(r.id)); // pré-remplit le lien du push
    } catch (e) { flash(`Échec : ${(e as Error).message}`); } finally { setPBusy(false); }
  };
  const remove = async (id: string) => { try { await deletePromo({ id }); flash('Promo supprimée.'); if (pId === id) newPromo(); } catch (e) { flash(`Échec : ${(e as Error).message}`); } };

  return (
    <div className="max-w-5xl grid lg:grid-cols-2 gap-8">
      {/* Composer push */}
      <div>
        <h2 className="text-2xl font-black mb-4 flex items-center gap-2"><Bell className="w-5 h-5 text-[#a855f7]" />Envoyer un push</h2>
        <div className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" maxLength={60} className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-[#a855f7] outline-none" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={2} maxLength={160} className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm resize-none focus:border-[#a855f7] outline-none" />
          {/* Image d'aperçu : upload direct (Storage public) OU coller une URL */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer bg-white/[0.06] hover:bg-white/10 rounded-xl px-3 py-2.5 text-xs font-bold flex items-center gap-1.5 shrink-0">
                {uploadingImg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Importer une image
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
              </label>
              {imageUrl && <button onClick={() => setImageUrl('')} className="text-white/40 hover:text-red-400 text-xs font-bold">retirer</button>}
            </div>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="…ou colle une URL d'image (optionnel)" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs focus:border-[#a855f7] outline-none" />
            {imageUrl && <img src={imageUrl} alt="aperçu" className="rounded-lg max-h-28 w-auto object-cover border border-white/10" />}
          </div>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Lien au clic (ex. page promo)" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs focus:border-[#a855f7] outline-none" />
          <button onClick={send} disabled={sending} className="bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black uppercase text-sm rounded-xl py-3 flex items-center justify-center gap-2">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Envoyer à tous</button>
          <p className="text-[10px] text-white/30">Le push affiche titre + message + image ; le HTML riche va sur une page promo (ci-contre) vers laquelle pointe le lien.</p>
        </div>
      </div>

      {/* Pages promo */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-black">Pages promo</h2>
          <button onClick={newPromo} className="text-xs font-black bg-white/[0.06] hover:bg-white/10 rounded-lg px-3 py-1.5">+ Nouvelle</button>
        </div>
        <div className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-3">
          <input value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="Titre de la page" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-[#a855f7] outline-none" />
          <textarea value={pHtml} onChange={(e) => setPHtml(e.target.value)} placeholder="<h1>Ma promo</h1><p>Contenu HTML…</p>" rows={7} className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono resize-y focus:border-[#a855f7] outline-none" />
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={pPub} onChange={(e) => setPPub(e.target.checked)} /> Publiée (visible publiquement)</label>
          <button onClick={save} disabled={pBusy} className="bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black text-sm rounded-xl py-2.5">{pBusy ? 'Enregistrement…' : (pId ? 'Mettre à jour' : 'Créer la page')}</button>
        </div>
        {promos.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {promos.map((p) => (
              <div key={p.id} className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-xl p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{p.title} {p.published ? <span className="text-[9px] text-emerald-400">● publiée</span> : <span className="text-[9px] text-white/30">brouillon</span>}</p>
                  <a href={promoLink(p.id)} target="_blank" rel="noreferrer" className="text-[10px] text-[#a855f7] hover:underline flex items-center gap-1"><ExternalLink className="w-2.5 h-2.5" />{promoLink(p.id)}</a>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => editPromo(p)} className="text-[10px] font-black bg-white/[0.06] hover:bg-white/10 rounded-lg px-2 py-1.5">Éditer</button>
                  <button onClick={() => remove(p.id)} className="text-white/40 hover:text-red-400 p-1.5" aria-label="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminSupplier({ flash }: { flash: (m: string) => void }) {
  const [bal, setBal] = useState<any | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [sel, setSel] = useState<any | null>(null);   // produit Reloadly sélectionné
  const [catId, setCatId] = useState('');             // productId catalogue (ex. apple-gift-card__0)
  const [unit, setUnit] = useState('');
  const [auto, setAuto] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { reloadlyBalance().then(setBal).catch(() => setBal({ configured: false })); }, []);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try { const r = await reloadlyFindProducts({ query: query.trim() }); setResults(r.products || []); }
    catch (e) { flash(`Recherche échouée : ${(e as Error).message}`); } finally { setSearching(false); }
  };
  const pick = (p: any) => {
    setSel(p);
    setUnit(p.denominationType === 'FIXED' ? String(p.fixedRecipientDenominations?.[0] ?? '') : '');
  };
  const save = async () => {
    if (!sel || !catId.trim() || !unit) { flash('Renseigne le produit catalogue, le produit Reloadly et le montant.'); return; }
    setSaving(true);
    try {
      await setProductSupplier({ productId: catId.trim(), reloadlyProductId: sel.productId, reloadlyCountryCode: sel.countryCode, reloadlyUnitPrice: Number(unit), autoFulfill: auto });
      flash(`Mappé : ${catId.trim()} → ${sel.productName} (${unit} ${sel.recipientCurrencyCode})${auto ? ' · auto' : ''}`);
      setSel(null); setCatId(''); setUnit('');
    } catch (e) { flash(`Échec : ${(e as Error).message}`); } finally { setSaving(false); }
  };

  const lowBal = bal?.configured && typeof bal.balance === 'number' && bal.balance < 20;

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-black mb-4 flex items-center gap-2"><Boxes className="w-5 h-5 text-[#a855f7]" />Fournisseur (Reloadly)</h2>

      {/* Solde */}
      <div className={`rounded-2xl p-5 mb-6 border ${lowBal ? 'border-red-500/40 bg-red-500/5' : 'border-white/[0.06] bg-[var(--tt-surface)]'}`}>
        {!bal ? <Loader2 className="w-4 h-4 animate-spin" /> : !bal.configured ? (
          <p className="text-sm text-white/50">Reloadly non configuré (clés absentes).</p>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-black tabular-nums text-[#a855f7]">{bal.balance?.toLocaleString()} {bal.currencyCode}</p>
              <p className="text-xs text-white/50 font-bold mt-1">Solde fournisseur {lowBal && <span className="text-red-400">· solde bas !</span>}</p>
            </div>
            <span className="text-[10px] font-black text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" />connecté</span>
          </div>
        )}
      </div>

      {/* Mapping produit */}
      <h3 className="font-black text-sm mb-2">Mapper un produit du catalogue → Reloadly</h3>
      <div className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Chercher un produit Reloadly (ex. Steam, Google Play, App Store)" className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-[#a855f7] outline-none" />
          <button onClick={search} disabled={searching} className="bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black text-sm rounded-xl px-4">{searching ? '…' : 'Chercher'}</button>
        </div>
        {results.length > 0 && (
          <div className="max-h-52 overflow-y-auto flex flex-col gap-1">
            {results.map((p) => (
              <button key={p.productId} onClick={() => pick(p)} className={`text-left rounded-lg px-3 py-2 text-xs border ${sel?.productId === p.productId ? 'border-[#a855f7] bg-[#a855f7]/10' : 'border-white/[0.06] hover:bg-white/[0.04]'}`}>
                <span className="font-bold text-white">{p.productName}</span> <span className="text-white/40">· {p.recipientCurrencyCode} · {p.countryCode} · {p.denominationType}{p.discountPercentage ? ` · -${p.discountPercentage}%` : ''}</span>
                {p.denominationType === 'FIXED' && <span className="block text-white/40">dénoms : {(p.fixedRecipientDenominations || []).join(', ')}</span>}
              </button>
            ))}
          </div>
        )}
        {sel && (
          <div className="border-t border-white/[0.06] pt-3 flex flex-col gap-2">
            <p className="text-xs text-white/60">Sélectionné : <strong className="text-[#a855f7]">{sel.productName}</strong> (id {sel.productId})</p>
            <input value={catId} onChange={(e) => setCatId(e.target.value)} placeholder="ID produit catalogue (ex. apple-gift-card__0)" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono focus:border-[#a855f7] outline-none" />
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={`Montant à commander (${sel.recipientCurrencyCode})`} className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs focus:border-[#a855f7] outline-none" />
            <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Livraison automatique dès qu'une commande est payée</label>
            <button onClick={save} disabled={saving} className="bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black text-sm rounded-xl py-2.5">{saving ? 'Enregistrement…' : 'Mapper ce produit'}</button>
          </div>
        )}
        <p className="text-[10px] text-white/30">Les recharges jeu (Free Fire, PUBG…) ne sont pas des cartes Reloadly → laisse-les sans mapping, elles restent en livraison manuelle.</p>
      </div>
    </div>
  );
}

function AdminPricing({ flash }: { flash: (m: string) => void }) {
  const [cfg, setCfg] = useState<PricingConfig | null>(null);
  const [funding, setFunding] = useState<any | null>(null);
  const [perProvider, setPerProvider] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Champs config (unités lisibles → converties en cents/bps à l'envoi).
  const [acq, setAcq] = useState('142');     // HTG / USDT
  const [crypto, setCrypto] = useState('1'); // %
  const [margin, setMargin] = useState('15');// %
  const [mode, setMode] = useState<'markup' | 'margin'>('margin');
  const [round, setRound] = useState('5');   // HTG
  const [savingCfg, setSavingCfg] = useState(false);

  // Estimation float
  const [qty, setQty] = useState('1');
  const [availOnly, setAvailOnly] = useState(false);

  // Import / reprice
  const [country, setCountry] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // Coût manuel
  const [mProd, setMProd] = useState('');
  const [mFace, setMFace] = useState('');
  const [mDisc, setMDisc] = useState('0');
  const [mName, setMName] = useState('');
  const [mImage, setMImage] = useState('');
  const [mLabel, setMLabel] = useState('');
  const [mBusy, setMBusy] = useState(false);
  const [mPreview, setMPreview] = useState<any | null>(null);

  const applyCfg = (c: PricingConfig) => {
    setCfg(c);
    setAcq(String(c.acquisitionHtgCentsPerUsd / 100));
    setCrypto(String(c.cryptoDepositBps / 100));
    setMargin(String(c.marginBps / 100));
    setMode(c.marginMode);
    setRound(String(c.roundToHtgCents / 100));
  };

  const refresh = async (qtyPerProduct = Number(qty) || 1, availableOnly = availOnly) => {
    setLoading(true);
    try {
      const r = await estimateFunding({ qtyPerProduct, availableOnly });
      applyCfg(r.config);
      setFunding(r.human);
      setPerProvider(r.perProvider || {});
    } catch (e) { flash(`Estimation impossible : ${(e as Error).message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const saveCfg = async () => {
    setSavingCfg(true);
    try {
      const r = await setPricingConfig({
        acquisitionHtgCentsPerUsd: Math.round(parseFloat(acq) * 100),
        cryptoDepositBps: Math.round(parseFloat(crypto) * 100),
        marginBps: Math.round(parseFloat(margin) * 100),
        marginMode: mode,
        roundToHtgCents: Math.round(parseFloat(round) * 100),
      });
      applyCfg(r.config);
      flash('Config enregistrée. Relance « Importer Reloadly » pour appliquer les nouveaux prix au catalogue.');
    } catch (e) { flash(`Échec : ${(e as Error).message}`); } finally { setSavingCfg(false); }
  };

  const doImport = async () => {
    setImporting(true); setImportMsg('');
    try {
      let page: number | null = 1, total = 0, pages = 0;
      while (page && page <= 60) { // garde-fou anti-boucle
        const r: any = await reloadlyImportCatalog({ page, countryCode: country.trim() || undefined });
        total += r.imported; pages++;
        setImportMsg(`Page ${r.page}/${r.totalPages} — ${total} variantes importées…`);
        page = r.nextPage;
      }
      flash(`Import Reloadly terminé : ${total} variantes (${pages} pages), publiées (available:true) dans la catégorie Cartes cadeaux.`);
    } catch (e) { flash(`Import échoué : ${(e as Error).message}`); } finally { setImporting(false); }
  };

  const [clearing, setClearing] = useState(false);
  const doClear = async () => {
    if (!window.confirm('Supprimer TOUS les produits importés de Reloadly ? (pour un ré-import propre)')) return;
    setClearing(true);
    try { const r = await clearImportedProducts(); flash(`${r.deleted} produits Reloadly supprimés. Relance « Importer Reloadly ».`); await refresh(); }
    catch (e) { flash(`Échec : ${(e as Error).message}`); } finally { setClearing(false); }
  };

  const saveManual = async () => {
    if (!mProd.trim() || !mFace) { flash('ID produit et coût requis.'); return; }
    setMBusy(true);
    try {
      const r = await setProductCost({
        productId: mProd.trim(),
        faceUsdCents: Math.round(parseFloat(mFace) * 100),
        discountBps: Math.round((parseFloat(mDisc) || 0) * 100),
        name: mName.trim() || undefined,
        image: mImage.trim() || undefined,
        optionLabel: mLabel.trim() || undefined,
      });
      setMPreview(r.breakdown);
      flash(mName.trim()
        ? `Carte « ${mName.trim()} » créée dans Cartes cadeaux : ${htg(r.breakdown.retailHtgCents)}.`
        : `Prix calculé pour ${mProd.trim()} : ${htg(r.breakdown.retailHtgCents)}.`);
    } catch (e) { flash(`Échec : ${(e as Error).message}`); } finally { setMBusy(false); }
  };

  const inputCls = 'bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-[#a855f7] outline-none';
  const card = 'bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-5';
  const btn = 'bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black text-sm rounded-xl px-4 py-2.5 flex items-center justify-center gap-2';

  return (
    <div className="max-w-3xl flex flex-col gap-8">
      <h2 className="text-2xl font-black flex items-center gap-2"><Calculator className="w-5 h-5 text-[#a855f7]" />Tarification</h2>

      {/* Estimation du float */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-sm flex items-center gap-2"><Coins className="w-4 h-4 text-[#a855f7]" />Float initial à déposer</h3>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-white/50 font-bold"><input type="checkbox" checked={availOnly} onChange={(e) => { setAvailOnly(e.target.checked); refresh(Number(qty) || 1, e.target.checked); }} /> publiés seulement</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} onBlur={() => refresh()} type="number" min={1} className={`${inputCls} w-20`} title="Quantité par produit" />
          </div>
        </div>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : funding ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: 'USDT à déposer', v: `$${funding.usdtToDeposit}`, c: '#a855f7' },
              { l: 'Capital HTG', v: `${funding.htgCapital.toLocaleString()} G`, c: '#f97316' },
              { l: 'CA potentiel', v: `${funding.potentialRevenueHtg.toLocaleString()} G`, c: '#34d399' },
              { l: 'Marge projetée', v: `${funding.projectedMarginHtg.toLocaleString()} G`, c: '#fbbf24' },
            ].map((s) => (
              <div key={s.l} className="bg-black/20 rounded-xl p-3">
                <p className="text-lg font-black tabular-nums" style={{ color: s.c }}>{s.v}</p>
                <p className="text-[10px] text-white/50 font-bold mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-white/40">Aucun produit avec coût. Importe Reloadly ou saisis un coût manuel.</p>}
        {Object.keys(perProvider).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(perProvider).map(([src, t]: any) => (
              <span key={src} className="text-[10px] font-bold text-white/50 bg-white/[0.04] rounded-lg px-2 py-1">{src} : ${(t.usdtToDepositUsdCents / 100).toFixed(2)} USDT</span>
            ))}
          </div>
        )}
        <p className="text-[10px] text-white/30 mt-3">Quantité × chaque produit ayant un coût. Le capital HTG = USDT × taux d'acquisition.</p>
      </div>

      {/* Config tarification */}
      <div className={card}>
        <h3 className="font-black text-sm mb-1">Paramètres du calcul</h3>
        <p className="text-[11px] text-white/40 mb-3">face fournisseur → −remise → ×(1+frais crypto) → ×acquisition → marge → arrondi.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Acquisition (HTG / USDT)"><input value={acq} onChange={(e) => setAcq(e.target.value)} type="number" className={inputCls} /></Field>
          <Field label="Frais crypto (%)"><input value={crypto} onChange={(e) => setCrypto(e.target.value)} type="number" className={inputCls} /></Field>
          <Field label="Marge (%)"><input value={margin} onChange={(e) => setMargin(e.target.value)} type="number" className={inputCls} /></Field>
          <Field label="Mode de marge">
            <select value={mode} onChange={(e) => setMode(e.target.value as any)} className={inputCls}>
              <option value="margin">Vraie marge (÷0,85)</option>
              <option value="markup">Markup (×1,15)</option>
            </select>
          </Field>
          <Field label="Arrondi (HTG)"><input value={round} onChange={(e) => setRound(e.target.value)} type="number" className={inputCls} /></Field>
        </div>
        <button onClick={saveCfg} disabled={savingCfg} className={`${btn} mt-4`}>{savingCfg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Enregistrer la config</button>
      </div>

      {/* Import Reloadly + reprice */}
      <div className={card}>
        <h3 className="font-black text-sm mb-1">Auto-listing Reloadly</h3>
        <p className="text-[11px] text-white/40 mb-3">Importe tout le catalogue Reloadly (USD), prix calculés. Produits masqués (à activer un par un).</p>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Pays ISO (optionnel, ex. US)" className={`${inputCls} w-48`} />
          <button onClick={doImport} disabled={importing} className={btn}>{importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}Importer Reloadly</button>
          <button onClick={doClear} disabled={clearing} className="bg-red-500/15 hover:bg-red-500/25 disabled:opacity-40 text-red-300 font-black text-sm rounded-xl px-4 py-2.5 flex items-center gap-2">{clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Vider Reloadly</button>
        </div>
        {importMsg && <p className="text-[11px] text-white/50 mt-2 tabular-nums">{importMsg}</p>}
      </div>

      {/* Coût manuel (non-Reloadly / cartes non-USD comme Netflix) */}
      <div className={card}>
        <h3 className="font-black text-sm mb-1">Produit / carte manuelle (Netflix, Free Fire…)</h3>
        <p className="text-[11px] text-white/40 mb-3">Saisis le coût d'achat réel en USD ; le prix HTG est calculé avec la même marge. <strong className="text-white/60">Renseigne un Nom pour créer une carte affichable</strong> dans la catégorie Cartes cadeaux (ex. Netflix EUR converti à la main).</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <input value={mProd} onChange={(e) => setMProd(e.target.value)} placeholder="ID produit (ex. manual-netflix-25)" className={`${inputCls} font-mono text-xs sm:col-span-3`} />
          <Field label="Nom affiché (→ crée une carte)"><input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="ex. Netflix 25€" className={inputCls} /></Field>
          <Field label="Dénomination (badge)"><input value={mLabel} onChange={(e) => setMLabel(e.target.value)} placeholder="ex. 25 €" className={inputCls} /></Field>
          <Field label="URL du logo"><input value={mImage} onChange={(e) => setMImage(e.target.value)} placeholder="https://…" className={inputCls} /></Field>
          <Field label="Coût d'achat (USD)"><input value={mFace} onChange={(e) => setMFace(e.target.value)} type="number" step="0.01" className={inputCls} /></Field>
          <Field label="Remise fournisseur (%)"><input value={mDisc} onChange={(e) => setMDisc(e.target.value)} type="number" className={inputCls} /></Field>
        </div>
        <button onClick={saveManual} disabled={mBusy} className={`${btn} mt-3`}>{mBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Calculer & créer / tarifer</button>
        {mPreview && (
          <div className="mt-3 text-xs bg-black/20 rounded-xl p-3 flex flex-wrap gap-x-5 gap-y-1">
            <span className="text-white/50">coût : <strong className="text-white">{htg(mPreview.costHtgCents)}</strong></span>
            <span className="text-white/50">prix de vente : <strong className="text-[#a855f7]">{htg(mPreview.retailHtgCents)}</strong></span>
            <span className="text-white/50">marge : <strong className="text-emerald-400">{htg(mPreview.marginHtgCents)} ({(mPreview.effectiveMarginBps / 100).toFixed(1)}%)</strong></span>
          </div>
        )}
      </div>

      {/* Gestion stock & prix des produits manuels */}
      <AdminManualProducts flash={flash} />
    </div>
  );
}

function AdminManualProducts({ flash }: { flash: (m: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, { stock: string; priceHtg: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'products'));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((p) => p?.pricing?.source === 'manual');
      list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setRows(list);
      const e: Record<string, { stock: string; priceHtg: string }> = {};
      for (const p of list) e[p.id] = { stock: String(p.stock ?? 0), priceHtg: String(Math.round((p.priceCents ?? 0) / 100)) };
      setEdits(e);
    } catch (err) { flash(`Lecture impossible : ${(err as Error).message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async (p: any) => {
    const e = edits[p.id];
    const stock = parseInt(e.stock, 10);
    const priceHtg = parseInt(e.priceHtg, 10);
    if (!Number.isInteger(stock) || stock < 0 || !Number.isInteger(priceHtg) || priceHtg < 0) { flash('Stock et prix : entiers ≥ 0.'); return; }
    setBusy(p.id);
    try {
      await setProductInventory({ productId: p.id, stock, priceCents: priceHtg * 100 });
      flash(`« ${p.name} » mis à jour : stock ${stock}, prix ${priceHtg.toLocaleString()} HTG.`);
      await load();
    } catch (err) { flash(`Échec : ${(err as Error).message}`); } finally { setBusy(null); }
  };
  const toggle = async (p: any) => {
    setBusy(p.id);
    try { await setProductInventory({ productId: p.id, available: p.available === false }); await load(); }
    catch (err) { flash(`Échec : ${(err as Error).message}`); } finally { setBusy(null); }
  };
  const remove = async (p: any) => {
    setBusy(p.id);
    try { await deleteProduct({ productId: p.id }); flash(`« ${p.name} » supprimé.`); await load(); }
    catch (err) { flash(`Échec : ${(err as Error).message}`); } finally { setBusy(null); }
  };

  const inputCls = 'bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:border-[#a855f7] outline-none w-24 tabular-nums';

  return (
    <div className="bg-[var(--tt-surface)] border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-black text-sm flex items-center gap-2"><Boxes className="w-4 h-4 text-[#a855f7]" />Produits manuels — stock & prix</h3>
        <button onClick={load} className="text-[11px] font-bold text-white/50 hover:text-white flex items-center gap-1"><RefreshCw className="w-3 h-3" />Rafraîchir</button>
      </div>
      <p className="text-[11px] text-white/40 mb-3">Ajuste le stock, le prix de vente (HTG) et la disponibilité des produits créés à la main.</p>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : rows.length === 0 ? (
        <p className="text-xs text-white/40">Aucun produit manuel. Crée-en un via « Produit / carte manuelle » ci-dessus.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((p) => (
            <div key={p.id} className="bg-black/20 rounded-xl p-3 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{p.name} {p.available === false && <span className="text-[9px] text-red-400">masqué</span>}</p>
                <p className="text-[10px] text-white/30 font-mono truncate">{p.id}</p>
              </div>
              <label className="flex flex-col gap-0.5"><span className="text-[9px] text-white/40 font-bold uppercase">Stock</span>
                <input type="number" value={edits[p.id]?.stock ?? ''} onChange={(e) => setEdits({ ...edits, [p.id]: { ...edits[p.id], stock: e.target.value } })} className={inputCls} /></label>
              <label className="flex flex-col gap-0.5"><span className="text-[9px] text-white/40 font-bold uppercase">Prix HTG</span>
                <input type="number" value={edits[p.id]?.priceHtg ?? ''} onChange={(e) => setEdits({ ...edits, [p.id]: { ...edits[p.id], priceHtg: e.target.value } })} className={inputCls} /></label>
              <button onClick={() => save(p)} disabled={busy === p.id} className="bg-[#a855f7] hover:bg-[#b56ff5] disabled:opacity-40 text-black font-black text-xs rounded-lg px-3 py-1.5">{busy === p.id ? '…' : 'Enregistrer'}</button>
              <button onClick={() => toggle(p)} disabled={busy === p.id} className="bg-white/[0.06] hover:bg-white/10 disabled:opacity-40 text-white font-bold text-xs rounded-lg px-3 py-1.5">{p.available === false ? 'Afficher' : 'Masquer'}</button>
              <button onClick={() => remove(p)} disabled={busy === p.id} className="text-white/40 hover:text-red-400 p-1.5" aria-label="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-white/40 font-bold uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
