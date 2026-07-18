// Service worker FCM — affiche les notifications push reçues quand l'onglet n'a pas le focus
// (onglet fermé/en arrière-plan). Premier plan = géré par onMessage() dans le SDK client.
//
// Un service worker ne peut pas lire les variables d'environnement Vite (VITE_FIREBASE_*) :
// cette config est dupliquée ici en clair. Ce n'est PAS un secret — la config web Firebase est
// publique par nature (protégée par firestore.rules/storage.rules, pas par sa confidentialité).
// À renseigner avec le VRAI projet Firebase au déploiement (Console > Paramètres du projet >
// Vos applications > Web), en même temps que .env.production (src/firebase.ts).
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDdNu7n9rmSXegxO-mwWI6f_OdzaQevk4g',
  authDomain: 'thie-thie-services.firebaseapp.com',
  projectId: 'thie-thie-services',
  storageBucket: 'thie-thie-services.firebasestorage.app',
  messagingSenderId: '107344112497',
  appId: '1:107344112497:web:76396abdf83f0f5c31a4d0',
});

const messaging = firebase.messaging();
const BRAND_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M 50 15 L 85 30 L 70 65 L 50 85 L 30 65 L 15 30 Z' fill='%237C3AED' opacity='0.2'/%3E%3Cpath d='M 48 30 L 15 38 L 35 62 L 48 45 Z' fill='%239333EA'/%3E%3Cpath d='M 52 30 L 85 38 L 65 62 L 52 45 Z' fill='%239333EA'/%3E%3Cpath d='M 28 28 L 72 28 L 63 40 L 55 40 L 51 75 L 49 75 L 45 40 L 37 40 Z' fill='%23FFFFFF'/%3E%3C/svg%3E";

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'Thie Thie Services', {
    body: body || '',
    icon: BRAND_ICON,
    data: payload.data || {},
  });
});
