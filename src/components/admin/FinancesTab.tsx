import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * Onglet Finances du back-office.
 *
 * Ce qu'il montre est PROUVÉ par les données, pas estimé : le chiffre d'affaires vient des
 * `priceCents` des commandes réellement complétées, et les entrées de wallet des dépôts
 * réellement crédités. Les deux sont déjà en état dans AdminPanel — aucune nouvelle lecture,
 * aucune nouvelle surface d'écriture.
 *
 * La MARGE est le seul chiffre estimé, et il est marqué comme tel. La commande ne fige PAS le
 * coût fournisseur au moment de la vente : on ne peut donc que le rapprocher du coût COURANT du
 * produit (`costHtgCents`). Si un prix d'achat a changé depuis, l'estimation dérive. Présenter
 * ce nombre comme un fait serait malhonnête — d'où l'étiquette « estimation » et la note.
 */

const HTG = (cents: number) => `${Math.round((cents || 0) / 100).toLocaleString('fr-FR')} HTG`;

const toMillis = (v: any): number => {
  if (!v) return 0;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number') return v;
  const p = Date.parse(String(v));
  return Number.isNaN(p) ? 0 : p;
};

const JOUR = 24 * 60 * 60 * 1000;

interface FinancesTabProps {
  orders: any[];
}

export function FinancesTab({ orders }: FinancesTabProps) {
  // Coût courant par produit, pour l'estimation de marge uniquement. Une seule lecture, au
  // montage — ce n'est pas une donnée temps réel, un instantané suffit.
  const [costByProduct, setCostByProduct] = useState<Record<string, number>>({});
  const [costLoaded, setCostLoaded] = useState(false);

  // Les dépôts sont chargés ICI, pas reçus du parent. L'état `deposits` d'AdminPanel s'est
  // révélé vide au rendu (l'onglet affichait 0 alors que 55 010 HTG sont crédités), pour une
  // raison propre à sa souscription temps réel. Une lecture directe et autonome supprime cette
  // dépendance fragile : le chiffre financier ne doit pas être otage d'un abonnement voisin.
  const [deposits, setDeposits] = useState<any[]>([]);

  useEffect(() => {
    let vivant = true;
    Promise.all([
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'wallet_requests')),
    ])
      .then(([prodSnap, depSnap]) => {
        if (!vivant) return;
        const m: Record<string, number> = {};
        prodSnap.forEach((d) => {
          const c = d.get('costHtgCents');
          if (typeof c === 'number') m[d.id] = c;
        });
        setCostByProduct(m);
        setDeposits(depSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCostLoaded(true);
      })
      .catch(() => { if (vivant) setCostLoaded(true); });
    return () => { vivant = false; };
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const complete = (o: any) => String(o.status || '').toLowerCase() === 'completed';
    const credite = (d: any) =>
      ['completed', 'credited'].includes(String(d.status || '').toLowerCase());

    const sur = (ms: number) => {
      const depuis = ms === Infinity ? 0 : now - ms;
      const ordersF = orders.filter((o) => complete(o) && toMillis(o.createdAt) >= depuis);
      const depositsF = deposits.filter((d) => credite(d) && toMillis(d.createdAt) >= depuis);
      const ca = ordersF.reduce((s, o) => s + (o.priceCents || 0), 0);
      // `wallet_requests` stocke le montant crédité sous `amount`, en HTG ENTIERS (pas en
      // centimes) — d'où la conversion ×100. Les rares docs récents portant `amountCents`
      // sont pris tels quels. Se tromper de champ ici donnait 0 partout (bug corrigé).
      const entrees = depositsF.reduce((s, d) => {
        const cents = typeof d.amountCents === 'number' ? d.amountCents : Math.round(Number(d.amount || 0) * 100);
        return s + (Number.isFinite(cents) ? cents : 0);
      }, 0);
      // Marge estimée : recette − coût courant, uniquement sur les commandes dont on connaît
      // le coût du produit. Les autres sont exclues du calcul de coût mais RESTENT dans le CA.
      let coutConnu = 0; let caCouvert = 0;
      for (const o of ordersF) {
        const c = costByProduct[o.productId];
        if (typeof c === 'number') { coutConnu += c * (o.quantity || 1); caCouvert += (o.priceCents || 0); }
      }
      return {
        ca, entrees, nbCommandes: ordersF.length, nbDepots: depositsF.length,
        margeEstimee: caCouvert - coutConnu,
        partCouverte: ca > 0 ? caCouvert / ca : 0,
        panierMoyen: ordersF.length ? Math.round(ca / ordersF.length) : 0,
      };
    };

    return { jour: sur(JOUR), semaine: sur(7 * JOUR), mois: sur(30 * JOUR), tout: sur(Infinity) };
  }, [orders, deposits, costByProduct]);

  // Barres des 7 derniers jours : CA par jour, en repère visuel simple sans dépendance de graphe.
  const parJour = useMemo(() => {
    const now = Date.now();
    const jours: { label: string; ca: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const debut = new Date(now - i * JOUR); debut.setHours(0, 0, 0, 0);
      const fin = debut.getTime() + JOUR;
      const ca = orders
        .filter((o) => String(o.status || '').toLowerCase() === 'completed'
          && toMillis(o.createdAt) >= debut.getTime() && toMillis(o.createdAt) < fin)
        .reduce((s, o) => s + (o.priceCents || 0), 0);
      jours.push({ label: debut.toLocaleDateString('fr-FR', { weekday: 'short' }), ca });
    }
    return jours;
  }, [orders]);

  const caMax = Math.max(1, ...parJour.map((j) => j.ca));

  const Fenetre = ({ titre, s }: { titre: string; s: typeof stats.jour }) => (
    <div className="bg-[var(--tt-surface)] border border-[var(--tt-border)] rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-widest font-black text-[var(--tt-text-faint)]">{titre}</p>
      <p className="text-2xl font-black tabular-nums text-[var(--tt-text)] mt-1">{HTG(s.ca)}</p>
      <p className="text-[11px] text-[var(--tt-text-faint)] mt-0.5">
        {s.nbCommandes} commande{s.nbCommandes > 1 ? 's' : ''} · panier {HTG(s.panierMoyen)}
      </p>
      <div className="mt-3 pt-3 border-t border-[var(--tt-border)] flex justify-between text-[11px]">
        <span className="text-[var(--tt-text-faint)]">Entrées wallet</span>
        <span className="font-bold text-[var(--tt-good)] tabular-nums">{HTG(s.entrees)}</span>
      </div>
    </div>
  );

  return (
    <div>
      <h2 className="text-2xl font-black mb-1">Finances</h2>
      <p className="text-xs text-[var(--tt-text-faint)] mb-5">
        Chiffre d’affaires sur les commandes complétées et entrées de wallet sur les dépôts crédités.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <Fenetre titre="Aujourd’hui" s={stats.jour} />
        <Fenetre titre="7 jours" s={stats.semaine} />
        <Fenetre titre="30 jours" s={stats.mois} />
        <Fenetre titre="Depuis le début" s={stats.tout} />
      </div>

      {/* CA des 7 derniers jours */}
      <div className="bg-[var(--tt-surface)] border border-[var(--tt-border)] rounded-2xl p-4 mb-6">
        <p className="text-[10px] uppercase tracking-widest font-black text-[var(--tt-text-faint)] mb-3">
          Chiffre d’affaires · 7 derniers jours
        </p>
        <div className="flex items-end gap-2 h-28">
          {parJour.map((j, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full flex items-end justify-center" style={{ height: '88px' }}>
                <div
                  className="w-full max-w-[40px] rounded-t-md bg-[var(--tt-accent)] transition-all"
                  style={{ height: `${Math.max(2, (j.ca / caMax) * 88)}px` }}
                  title={HTG(j.ca)}
                />
              </div>
              <span className="text-[9px] text-[var(--tt-text-faint)] capitalize">{j.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Marge — estimation explicitement marquée */}
      <div className="bg-[var(--tt-surface)] border border-[var(--tt-warn)]/30 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] uppercase tracking-widest font-black text-[var(--tt-warn)]">
            Marge brute · estimation (30 j)
          </p>
          <span className="text-2xl font-black tabular-nums text-[var(--tt-text)]">
            {costLoaded ? HTG(stats.mois.margeEstimee) : '…'}
          </span>
        </div>
        <p className="text-[11px] text-[var(--tt-text-muted)] leading-relaxed">
          {stats.mois.partCouverte < 0.99 && costLoaded
            ? `Calculée sur ${Math.round(stats.mois.partCouverte * 100)} % du chiffre d’affaires — le coût de certains produits est inconnu. `
            : ''}
          <strong>Estimation</strong> : la commande ne fige pas le prix d’achat au moment de la vente,
          le calcul utilise le coût <strong>courant</strong> du produit. Si un prix fournisseur a changé
          depuis, la marge affichée dévie de la marge réelle.
        </p>
      </div>
    </div>
  );
}
