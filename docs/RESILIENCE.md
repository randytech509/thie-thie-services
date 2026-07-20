# Dépendance à la plateforme — audit et ordre de traitement

État au 2026-07-20. Ce document répond à une proposition de mitigation en deux volets
(découplage progressif vers Supabase/PostgreSQL, sauvegardes hors-site automatisées).
Sa conclusion principale : **l'ordre proposé est à inverser**, et un troisième chantier,
déjà daté, passe avant les deux.

---

## 1. Ce qu'on cherche réellement à couvrir

« Dépendance au fournisseur » recouvre trois risques distincts, qui n'appellent pas la même
réponse. Les confondre conduit à payer très cher une migration qui ne traite pas le risque
qu'on redoutait.

| Risque | Probabilité | Impact | Réponse adaptée |
|---|---|---|---|
| **Perte d'accès au compte** (suspension, litige de facturation, compromission) | faible mais non nulle | **fatal** — plus de commandes, plus de soldes, plus de KYC | Sauvegardes hors-site |
| **Dérive de coût** à mesure que le trafic monte | moyenne | gênant, jamais fatal | Discipline d'index et de requêtes |
| **Arrêt / rupture de la plateforme** | très faible pour Firestore… | grave | Portabilité des données |

Le troisième mérite une nuance importante : la rupture n'est pas hypothétique, elle est
**déjà datée**. Le runtime **Node.js 20 est décommissionné le 2026-10-30**. Après cette date,
plus aucun déploiement de Cloud Function ne passe — y compris un correctif de sécurité urgent.
C'est la manifestation concrète du risque plateforme sur ce projet, et elle arrive dans
environ trois mois.

---

## 2. Pourquoi le découplage vers PostgreSQL n'est pas « progressif » ici

L'idée de migrer d'abord **les données transactionnelles critiques** est intuitive — ce sont
les plus précieuses. C'est précisément pour cela qu'elles sont le plus mauvais point de départ.

**Les invariants financiers ne vivent pas dans la base, ils vivent autour d'elle.** Sur ce
projet, ils sont tenus par trois couches solidaires :

1. les **règles Firestore** (58 tests) — champs financiers en écriture serveur uniquement,
   transitions de `wallet_requests` fermées au client, ledger `wallet_transactions` immuable ;
2. les **transactions Cloud Functions** — `placeOrder` et `creditWallet` sont atomiques,
   idempotents sur une clé, et vérifient stock et solde dans la même transaction ;
3. **App Check**, qui conditionne l'accès aux fonctions appelables.

Déplacer les soldes vers PostgreSQL suppose de réécrire les trois. Ce n'est pas une migration
de données, c'est une réécriture de la couche financière.

**Et l'état intermédiaire est plus dangereux que la situation actuelle.** Tant que les deux
bases coexistent, chaque débit doit être écrit dans les deux sans transaction distribuée. Si
la seconde écriture échoue, le solde diverge. Sur un wallet qui débite de l'argent réel, une
divergence de solde est un incident plus grave que la dépendance qu'on cherchait à réduire.

**Si un découplage a lieu un jour, il doit commencer par le NON critique** — catalogue produits,
journaux, contenus. On y valide la chaîne d'export, le schéma cible et l'outillage, sans jamais
exposer les soldes. L'argent se déplace en dernier, ou pas du tout.

---

## 3. Les sauvegardes hors-site : le vrai premier pas

C'est le volet à faire en premier, et de loin :

- il couvre le risque **fatal** (perte d'accès au compte), pas un risque de confort ;
- il est **additif** — aucune ligne du code applicatif ne change, donc aucun risque de régression ;
- il rend **la portabilité mesurable** : une fois les exports quotidiens en place, on sait
  exactement ce que contiennent les données et ce que coûterait une migration. Sans exports,
  toute estimation de migration est une devinette ;
- il se met en place en quelques heures, contre plusieurs semaines pour un découplage.

**Forme recommandée.** Un export planifié `gcloud firestore export` vers un bucket, puis
recopie vers un stockage froid **chez un autre fournisseur** (Cloudflare R2 ou AWS S3). Le point
qui compte : la copie hors-site doit être chez un **tiers**, avec des identifiants distincts.
Une sauvegarde stockée dans le même compte Google disparaît avec lui — elle ne couvre alors
que l'erreur humaine, pas la perte de compte, qui est le scénario visé.

**Prérequis côté propriétaire du projet** (non réalisables sans ses accès) :

1. un compte de service Google avec le rôle *Datastore Import Export Admin* ;
2. un bucket de destination chez R2 ou S3, et ses clés ;
3. ces deux jeux d'identifiants déposés en secrets GitHub Actions.

**Implémentation** : `.github/workflows/firestore-backup.yml` (quotidien 03:30 UTC + déclenchement
manuel). Il n'écrit jamais dans la base — il exporte et recopie, il ne peut donc pas dégrader la
production. Une étape vérifie que la copie distante n'est pas vide : un `rclone copy` réussit sans
rien transférer si la source l'est, et on croirait sauvegarder pendant des mois pour rien.

### Restaurer (à répéter au moins une fois par trimestre)

Une sauvegarde jamais restaurée est une hypothèse, pas une sauvegarde. La restauration d'essai
se fait vers **`thie-thie-dev`**, jamais vers la production.

```bash
# 1. Rapatrier un instantané depuis le tiers vers un bucket GCS accessible au projet de test
rclone copy r2:<BUCKET>/firestore/<AAAA-MM-JJ_HHMMSS> \
            gcs:<BUCKET_TEST>/restore/<AAAA-MM-JJ_HHMMSS>

# 2. Importer dans le projet de DÉVELOPPEMENT
gcloud firestore import gs://<BUCKET_TEST>/restore/<AAAA-MM-JJ_HHMMSS> \
  --project=thie-thie-dev
```

Puis contrôler que les collections critiques sont présentes et cohérentes : `users`,
`wallet_transactions`, `orders`, `wallet_requests`. Un import ne signale pas une collection
manquante — c'est à la vérification de le faire.

⚠️ `gcloud firestore import` **écrase** les documents de même identifiant. Ne jamais viser la
production pour un essai : vérifier deux fois la valeur de `--project`.

---

## 4. Ordre recommandé

1. **Migration du runtime Node.js 20** — échéance ferme au **2026-10-30**. Passé cette date,
   plus aucun déploiement n'est possible, ce qui bloquerait aussi tout correctif urgent. À
   traiter avec les 77 tests de fonctions en filet, pas dans l'urgence d'octobre.
2. **Sauvegardes hors-site automatisées** — risque fatal couvert, aucun risque de régression,
   et préalable à toute estimation sérieuse de migration.
3. **Découplage** — à rediscuter *après* le point 2, avec un motif chiffré (facture réelle,
   incident vécu, exigence d'un partenaire). Si le motif est le coût, l'examen des index et des
   requêtes coûte bien moins cher qu'un changement de base.

---

## 5. Ce que ce document ne dit pas

Il ne dit pas que PostgreSQL serait un mauvais choix, ni que la dépendance actuelle est
anodine. Il dit que **l'ordre compte** : engager la réécriture de la couche financière avant
d'avoir une sauvegarde exploitable revient à augmenter le risque pendant plusieurs semaines
pour en réduire un autre, moins probable, plus tard.
