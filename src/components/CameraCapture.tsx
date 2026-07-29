import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, RefreshCw, Check, X, Upload, Loader2 } from 'lucide-react';

interface CameraCaptureProps {
  /** 'environment' = caméra arrière (pièce d'identité), 'user' = caméra frontale (selfie). */
  facingMode?: 'environment' | 'user';
  /** Titre affiché en haut (ex. "Photo de la pièce d'identité"). */
  title: string;
  lang: 'FR' | 'HT';
  /** Appelé avec le fichier capturé (ou importé en repli). */
  onCapture: (file: File) => void;
  onClose: () => void;
}

/**
 * Caméra in-app avec aperçu + reprise (getUserMedia). Remplace l'import de fichier pour le KYC :
 * l'utilisateur vise, capture, voit l'aperçu et peut refaire avant de valider. Repli automatique
 * sur l'import de fichier si la caméra est indisponible (desktop sans webcam, permission refusée,
 * navigateur non compatible) — la vérification KYC ne doit jamais être bloquée par le matériel.
 */
export function CameraCapture({ facingMode = 'environment', title, lang, onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setReady(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const res = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      let stream: MediaStream;
      try {
        // `exact` FORCE la caméra demandée (frontale pour le selfie). Sans ça, la contrainte souple
        // est seulement « advisory » et Chrome/Pixel retombe souvent sur la caméra arrière.
        stream = await navigator.mediaDevices.getUserMedia({ video: { ...res, facingMode: { exact: facingMode } }, audio: false });
      } catch {
        // Aucune caméra ne correspond EXACTEMENT (ex. appareil sans caméra frontale) → repli souple.
        stream = await navigator.mediaDevices.getUserMedia({ video: { ...res, facingMode }, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch {
      // Permission refusée / pas de caméra / non supporté → on bascule sur l'import de fichier.
      setError(lang === 'FR'
        ? "Caméra indisponible. Vous pouvez importer une photo depuis vos fichiers."
        : "Kamera pa disponib. Ou ka enpòte yon foto depi fichye ou yo.");
    }
  }, [facingMode, lang]);

  useEffect(() => {
    startCamera();
    return stopStream;
  }, [startCamera, stopStream]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `kyc-${Date.now()}.jpg`, { type: 'image/jpeg' });
      stopStream();
      setPreview({ url: URL.createObjectURL(blob), file });
    }, 'image/jpeg', 0.9);
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    startCamera();
  };

  const confirm = () => {
    if (!preview) return;
    onCapture(preview.file);
    URL.revokeObjectURL(preview.url);
    onClose();
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { onCapture(f); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="w-full max-w-md bg-[var(--tt-surface)] border border-[var(--tt-border)] rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--tt-border)]">
          <span className="text-xs font-black text-[var(--tt-text)] flex items-center gap-2">
            <Camera className="w-4 h-4 text-[var(--tt-accent)]" /> {title}
          </span>
          <button onClick={() => { stopStream(); onClose(); }} className="p-1.5 text-[var(--tt-text-faint)] hover:text-[var(--tt-text)]" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative bg-black aspect-[3/4] flex items-center justify-center overflow-hidden">
          {/* Aperçu de la photo capturée */}
          {preview ? (
            <img src={preview.url} alt="" className="w-full h-full object-contain" />
          ) : (
            <>
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              {!ready && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-[11px] font-bold">{lang === 'FR' ? 'Ouverture de la caméra…' : 'Kamera ap louvri…'}</span>
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 text-white/80">
                  <Camera className="w-7 h-7 opacity-60" />
                  <span className="text-[11px] font-semibold leading-snug">{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Contrôles */}
        <div className="p-4 flex items-center justify-center gap-3">
          {preview ? (
            <>
              <button onClick={retake} className="flex-1 py-3 rounded-2xl bg-[var(--tt-surface-2)] border border-[var(--tt-border)] text-[var(--tt-text)] font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <RefreshCw className="w-4 h-4" /> {lang === 'FR' ? 'Refaire' : 'Refè'}
              </button>
              <button onClick={confirm} className="flex-1 py-3 rounded-2xl bg-[var(--tt-accent)] text-[var(--tt-on-accent)] font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <Check className="w-4 h-4" /> {lang === 'FR' ? 'Utiliser' : 'Sèvi avè l'}
              </button>
            </>
          ) : error ? (
            <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-3 rounded-2xl bg-[var(--tt-accent)] text-[var(--tt-on-accent)] font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform">
              <Upload className="w-4 h-4" /> {lang === 'FR' ? 'Importer une photo' : 'Enpòte yon foto'}
            </button>
          ) : (
            <>
              <button
                onClick={capture}
                disabled={!ready}
                className="w-16 h-16 rounded-full bg-[var(--tt-accent)] text-[var(--tt-on-accent)] flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform shadow-lg"
                aria-label={lang === 'FR' ? 'Capturer' : 'Pran foto'}
              >
                <Camera className="w-6 h-6" />
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="absolute right-6 text-[10px] font-bold text-[var(--tt-text-faint)] hover:text-[var(--tt-text)] flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" /> {lang === 'FR' ? 'Fichier' : 'Fichye'}
              </button>
            </>
          )}
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={onFilePicked} />
        </div>
      </motion.div>
    </div>
  );
}
