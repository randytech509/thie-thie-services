import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { Monitor, Wifi } from 'lucide-react';

/**
 * Sessions d'appareil du compte courant.
 *
 * « Active » = vue dans les 30 dernières minutes. Le seuil est un choix : trop court, une
 * session réelle laissée ouverte disparaît de la liste ; trop long, une session fermée y
 * traîne. 30 min correspond à peu près au rythme de rafraîchissement (focus) plus une marge.
 *
 * Montre l'IP et l'appareil pour que l'admin repère une session qu'il ne reconnaît pas — c'est
 * le signal d'un compte compromis. La donnée est constatée serveur (cf. sessions.ts) ; ce
 * composant ne fait que lire ses propres sessions (les règles l'y limitent).
 */

const ACTIVE_MS = 30 * 60 * 1000;

const toMillis = (v: any): number => {
  if (!v) return 0;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number') return v;
  const p = Date.parse(String(v));
  return Number.isNaN(p) ? 0 : p;
};

const ilYA = (ms: number): string => {
  if (!ms) return '—';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
};

export function SessionsPanel({ uid }: { uid: string }) {
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    if (!uid) return;
    // Pas d'orderBy ici : toutes les sessions d'un compte tiennent en poignée de docs, et
    // trier côté client évite une dépendance d'index composite.
    const q = query(collection(db, 'user_sessions'), where('uid', '==', uid));
    return onSnapshot(q, (s) => setSessions(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
  }, [uid]);

  const { actives, triees } = useMemo(() => {
    const now = Date.now();
    const triees = [...sessions].sort((a, b) => toMillis(b.lastSeenAt) - toMillis(a.lastSeenAt));
    const actives = triees.filter((s) => !s.ended && now - toMillis(s.lastSeenAt) < ACTIVE_MS).length;
    return { actives, triees };
  }, [sessions]);

  return (
    <div className="bg-[var(--tt-surface)] border border-[var(--tt-border)] rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-[var(--tt-accent)]" />
          <h3 className="text-sm font-black text-[var(--tt-text)]">Sessions de mon compte</h3>
        </div>
        <span className="text-[11px] font-bold text-[var(--tt-good)] tabular-nums">
          {actives} active{actives > 1 ? 's' : ''}
        </span>
      </div>

      {triees.length === 0 ? (
        <p className="text-[11px] text-[var(--tt-text-faint)]">Aucune session enregistrée pour le moment.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {triees.map((s) => {
            const active = !s.ended && Date.now() - toMillis(s.lastSeenAt) < ACTIVE_MS;
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 bg-[var(--tt-surface-2)] border border-[var(--tt-border)] rounded-xl px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-[var(--tt-text)] truncate">{s.device || 'Appareil inconnu'}</p>
                  <p className="text-[10px] text-[var(--tt-text-faint)] font-mono flex items-center gap-1.5 mt-0.5">
                    <Wifi className="w-3 h-3" /> {s.ip || '—'} · {ilYA(toMillis(s.lastSeenAt))}
                  </p>
                </div>
                <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  active
                    ? 'bg-[var(--tt-good-soft)] text-[var(--tt-good)]'
                    : 'bg-[var(--tt-overlay)] text-[var(--tt-text-faint)]'
                }`}>
                  {active ? 'Active' : s.ended ? 'Fermée' : 'Inactive'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
