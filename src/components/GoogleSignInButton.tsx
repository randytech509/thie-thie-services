import { useEffect, useRef } from 'react';

/**
 * Bouton OFFICIEL « Sign in with Google » via Google Identity Services (GIS).
 * Rend le vrai bouton Google (branding à jour, sélecteur de compte / One Tap FedCM) au lieu d'un
 * SVG dessiné. Renvoie l'ID token Google via `onCredential` ; l'appelant l'échange contre une
 * session Firebase (`signInWithCredential(GoogleAuthProvider.credential(idToken))`).
 */
interface Props {
  clientId: string;
  theme?: 'dark' | 'light';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  onCredential: (idToken: string) => void;
}

// Le script GIS n'est chargé qu'une seule fois pour toute l'app.
let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Chargement de Google Identity Services échoué'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

export function GoogleSignInButton({ clientId, theme = 'dark', text = 'continue_with', onCredential }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as any).google;
        g.accounts.id.initialize({
          client_id: clientId,
          callback: (resp: { credential?: string }) => { if (resp?.credential) cbRef.current(resp.credential); },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        const width = Math.min(400, Math.max(240, ref.current.offsetWidth || 320));
        ref.current.innerHTML = '';
        g.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text,
          shape: 'pill',
          logo_alignment: 'center',
          width,
        });
      })
      .catch(() => { /* GIS indisponible : l'UI reste utilisable via e-mail/mot de passe */ });
    return () => { cancelled = true; };
  }, [clientId, theme, text]);

  return <div ref={ref} className="w-full flex justify-center min-h-[44px]" />;
}
