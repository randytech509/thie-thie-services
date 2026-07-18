# RandyTech Solutions

Application **Thie Thie Services** — boutique digitale pour le marché haïtien
(recharges gaming, cartes cadeaux, abonnements streaming), **développée par RandyTech
Solutions**. Paiement par **wallet interne** en gourdes (HTG), bilingue français/créole haïtien.

> Projet en pré-lancement. Ce dépôt est publié à titre de démonstration
> technique (portfolio). Voir [LICENSE.md](LICENSE.md) — usage commercial
> soumis à licence.

## Stack

- **Frontend** : Vite 6 + React 19 + TypeScript + Tailwind CSS v4
- **Backend** : fonctions serverless + base de données managée (mutations financières
  serveur-only), stockage de fichiers, protection anti-bots
- **Paiements** : dépôts manuels MonCash/NatCash/Binance Pay/PayPal (vérification
  automatisée par lecture de SMS reçus) + recharge crypto USDT (OxaPay)

## Sécurité

Architecture durcie à la suite d'un audit de sécurité complet avant lancement :

- Tous les champs financiers (`walletBalanceCents`, `thieThiePoints`, statuts de
  commande) sont **serveur-only** — aucune écriture client possible, y compris
  pour un compte admin.
- Ledger d'audit append-only pour chaque mouvement de solde.
- Crédit de wallet idempotent (clé d'idempotence sur chaque dépôt/commande) —
  aucun double-crédit possible en cas de rejeu.
- Vérification automatisée des dépôts MonCash/NatCash par lecture des SMS
  entrants du téléphone marchand (webhook signé, direction du SMS vérifiée
  pour ne jamais créditer un SMS sortant).
- Recharge crypto verrouillée derrière une vérification d'identité (KYC) légère,
  approuvée manuellement par un admin — jamais approuvable côté client.
- Protection anti-bots (reCAPTCHA v3) obligatoire sur les fonctions sensibles.

## Tests

```bash
npm run test        # 40 tests de règles de sécurité + 42 tests de fonctions
npm run test:rules  # règles de sécurité seules (émulateur)
npm run test:functions
```

Un scénario de bout en bout complet contre de vrais émulateurs (inscription →
dépôt → achat → points de fidélité) est disponible via
`node scripts/e2e-emulator.mjs`.

## Développement local

```bash
npm install
cp .env.example .env.local   # config émulateurs (aucun secret réel requis)
npm run dev                  # SPA sur http://localhost:3000
```

Les fonctions serverless et les règles de base de données/stockage se testent
contre des émulateurs locaux — aucun projet cloud réel n'est nécessaire pour
développer ou lancer la suite de tests.

## Configuration des comptes de dépôt

Les coordonnées de dépôt affichées aux clients (MonCash, NatCash, Binance Pay,
PayPal) ne sont **pas** dans le code source — elles vivent dans un document
de configuration `config/depositAccounts` (lecture publique, écriture serveur-only).
Pour les configurer en production :

```bash
cp scripts/deposit-accounts.example.json scripts/deposit-accounts.json
# éditer scripts/deposit-accounts.json avec les vraies coordonnées (gitignored)
node scripts/seed-deposit-accounts.mjs
```

---

Un projet [RandyTech Solutions](https://randytech-agency.com).
