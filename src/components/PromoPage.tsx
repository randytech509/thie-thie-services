import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Page promo publique (rendu du HTML admin). Chargée par ID de document (?promo=<id>) via un
 * `get` Firestore — autorisé seulement si la promo est publiée (firestore.rules). Le HTML est
 * rendu dans une IFRAME SANDBOX (srcDoc) : isolé du DOM/cookies de l'app, il ne peut pas exécuter
 * de script (pas d'`allow-scripts`) ni exfiltrer la session — sécurité même si le HTML est riche.
 */
export function PromoPage({ id }: { id: string }) {
  const [state, setState] = useState<'loading' | 'notfound' | 'ok'>('loading');
  const [html, setHtml] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'promos', id))
      .then((s) => {
        const d = s.data();
        if (!s.exists() || !d?.published) { setState('notfound'); return; }
        setHtml((d.html as string) || '');
        setTitle((d.title as string) || 'Promo');
        setState('ok');
      })
      .catch(() => setState('notfound'));
  }, [id]);

  if (state === 'loading') return <div style={{ minHeight: '100vh', background: '#0a0e27', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Chargement…</div>;
  if (state === 'notfound') return (
    <div style={{ minHeight: '100vh', background: '#0a0e27', color: '#fff', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
      <p>Cette promotion n'est pas disponible.</p>
      <a href="/" style={{ color: '#ff9800', fontWeight: 700 }}>Retour au site</a>
    </div>
  );
  return (
    <div style={{ minHeight: '100vh', background: '#0a0e27', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', background: '#11162e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <a href="/" style={{ color: '#ff9800', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>← Thie Thie Services</a>
      </div>
      <iframe title={title} sandbox="allow-popups" srcDoc={html} style={{ flex: 1, width: '100%', border: 0, background: '#fff' }} />
    </div>
  );
}
