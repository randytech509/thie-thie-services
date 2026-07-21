import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsClient } from '../../firebase';
import { deviceId } from '../../lib/session';
import { Monitor, Wifi, LogOut, ShieldAlert } from 'lucide-react';

/**
 * Sessions d'appareil du compte courant — visible ET gérable par l'utilisateur lui-même.
 *
 * « Active » = vue dans les 30 dernières minutes. Trop court, une session réelle laissée
 * ouverte disparaît ; trop long, une session fermée traîne. 30 min ≈ rythme de rafraîchissement
 * (focus) plus une marge.
 *
 * L'IP et l'appareil sont CONSTATÉS serveur (cf. sessions.ts). Ce composant lit ses propres
 * sessions (les règles l'y limitent) et propose une seule action réellement efficace :
 * « déconnecter tous les autres appareils ». Firebase Auth ne permet pas de tuer le jeton d'UN
 * appareil précis — proposer une déconnexion par appareil serait un mensonge d'interface. On
 * expose donc l'action globale, honnête, et on affiche l'historique par appareil pour que
 * l'utilisateur voie d'où il s'est connecté.
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

interface SessionsPanelProps {
  uid: string;
  /** 'admin' ajoute un fond de carte plein ; 'profile' s'insère dans le Profil. */
  variant?: 'admin' | 'profile';
}

export function SessionsPanel({ uid }: SessionsPanelProps) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const monDevice = deviceId();

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'user_sessions'), where('uid', '==', uid));
    return onSnapshot(q, (s) => setSessions(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
  }, [uid]);

  const { actives, triees } = useMemo(() => {
    const now = Date.now();
    const triees = [...sessions].sort((a, b) => toMillis(b.lastSeenAt) - toMillis(a.lastSeenAt));
    const actives = triees.filter((s) => !s.ended && now - toMillis(s.lastSeenAt) < ACTIVE_MS).length;
    return { actives, triees };
  }, [sessions]);

  const autresActifs = triees.filter(
    (s) => s.deviceId !== monDevice && !s.ended && Date.now() - toMillis(s.lastSeenAt) < ACTIVE_MS,
  ).length;

  const deconnecterAutres = async () => {
    setBusy(true); setMsg(null);
    try {
      const r: any = await httpsCallable(functionsClient, 'revokeOtherSessions')({ deviceId: monDevice });
      setMsg(`${r?.data?.closes ?? 0} appareil(s) déconnecté(s). Ils devront se reconnecter.`);
    } catch {
      setMsg('Échec de la déconnexion. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[var(--tt-surface)] border border-[var(--tt-border)] rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-[var(--tt-accent)]" />
          <h3 className="text-sm font-black text-[var(--tt-text)]">Mes sessions</h3>
        </div>
        <span className="text-[11px] font-bold text-[var(--tt-good)] tabular-nums">
          {actives} active{actives > 1 ? 's' : ''}
        </span>
      </div>

      {triees.length === 0 ? (
        <p className="text-[11px] text-[var(--tt-text-faint)]">
          Aucune session enregistrée pour le moment. Elle apparaîtra à ta prochaine connexion depuis ce navigateur.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {triees.map((s) => {
            const active = !s.ended && Date.now() - toMillis(s.lastSeenAt) < ACTIVE_MS;
            const ceci = s.deviceId === monDevice;
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 bg-[var(--tt-surface-2)] border border-[var(--tt-border)] rounded-xl px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-[var(--tt-text)] truncate">
                    {s.device || 'Appareil inconnu'}
                    {ceci && <span className="ml-2 text-[9px] font-black uppercase text-[var(--tt-accent)]">cet appareil</span>}
                  </p>
                  <p className="text-[10px] text-[var(--tt-text-faint)] font-mono flex items-center gap-1.5 mt-0.5">
                    <Wifi className="w-3 h-3" /> {s.ip || '—'} · {ilYA(toMillis(s.lastSeenAt))}
                  </p>
                </div>
                <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  active ? 'bg-[var(--tt-good-soft)] text-[var(--tt-good)]'
                    : s.revoked ? 'bg-[var(--tt-danger-soft)] text-[var(--tt-danger)]'
                    : 'bg-[var(--tt-overlay)] text-[var(--tt-text-faint)]'
                }`}>
                  {active ? 'Active' : s.revoked ? 'Révoquée' : s.ended ? 'Fermée' : 'Inactive'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {msg && <p className="mt-3 text-[11px] text-[var(--tt-text-muted)]">{msg}</p>}

      {autresActifs > 0 && (
        <button
          onClick={deconnecterAutres}
          disabled={busy}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--tt-danger)]/40 bg-[var(--tt-danger-soft)] px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-[var(--tt-danger)] hover:bg-[var(--tt-danger)]/15 transition-colors disabled:opacity-40"
        >
          <LogOut className="w-4 h-4" />
          {busy ? 'Déconnexion…' : `Déconnecter les autres appareils (${autresActifs})`}
        </button>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[10px] text-[var(--tt-text-faint)] leading-relaxed">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
        Tu ne reconnais pas un appareil ou une adresse ? Déconnecte les autres appareils et change ton mot de passe.
      </p>
    </div>
  );
}
