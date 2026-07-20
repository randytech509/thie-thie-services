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

Une sauvegarde jamais restaurée est une hypothèse, pas une sauvegarde.

> **Correction du 2026-07-20.** Ce document indiquait de restaurer vers un projet
> `thie-thie-dev`. **Ce projet n'existe pas** : c'est un identifiant réservé à l'émulateur
> local (`.env.local`), jamais créé dans le cloud. La procédure était donc inapplicable — le
> genre de détail qu'on découvre le jour où l'on en a besoin en urgence.
>
> La cible correcte est une **base Firestore nommée** dans le même projet. La production vit
> dans `(default)` et n'est jamais touchée ; la base d'essai est supprimée après contrôle.

```bash
# 1. Créer une base d'essai isolée (jamais (default))
gcloud firestore databases create --database=restore-test \
  --location=us-central1 --type=firestore-native --project=thie-thie-services

# 2. Importer l'instantané. Depuis le bucket de transit s'il est encore là (< 7 jours),
#    sinon rapatrier d'abord depuis le tiers :
#    rclone copy r2:<BUCKET>/firestore/<AAAA-MM-JJ_HHMMSS> gcs:<TRANSIT>/firestore/<...>
gcloud firestore import gs://thie-thie-backup-transit/firestore/<AAAA-MM-JJ_HHMMSS> \
  --database=restore-test --project=thie-thie-services

# 3. Attendre la fin (l'import est asynchrone — ne rien conclure avant SUCCESSFUL)
gcloud firestore operations list --database=restore-test --project=thie-thie-services \
  --format="value(metadata.operationState)"
```

**4. Comparer avec la production, collection par collection.** C'est l'étape qui prouve
quelque chose : un import « réussi » sur une base vide réussit tout aussi bien. Compter les
documents des deux côtés via l'API REST (`:runAggregationQuery`, agrégation `count`) sur
`users`, `orders`, `products`, `wallet_transactions`, `wallet_requests`, `kyc_requests`.
Les écarts attendus ne portent que sur les collections qui grossissent en continu
(`admin_audit`, `notifications`), puisque la production a avancé depuis l'instantané.

**5. Supprimer la base d'essai** — elle est facturée tant qu'elle existe :

```bash
gcloud firestore databases delete --database=restore-test \
  --project=thie-thie-services --quiet
```

⚠️ `gcloud firestore import` **écrase** les documents de même identifiant. Vérifier deux fois
la valeur de `--database` avant de valider : viser `(default)` par distraction écraserait la
production avec des données périmées.

#### Dernier essai réalisé

**2026-07-20** — instantané `2026-07-20_073348` restauré dans `restore-test`, **342 documents**.
Comptes **identiques à la production** sur les six collections critiques (`users` 4, `orders` 13,
`products` 123, `wallet_transactions` 15, `wallet_requests` 3, `kyc_requests` 1). Base d'essai
supprimée. La sauvegarde n'est plus une hypothèse.

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
