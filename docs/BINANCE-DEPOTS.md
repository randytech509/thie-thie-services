# Dépôts crypto — audit de conception (Binance perso / Cwallet-CCPayment)

État au 2026-07-20. Document d'aide à la décision, **avant toute implémentation**. Le sujet
touche au crédit de soldes réels : une erreur de conception ici se paie en argent, pas en
temps de développement.

Contexte : OxaPay a refusé le dossier. Le repli envisagé est un compte Binance **personnel**
(et non marchand), avec une clé API en **lecture seule**, validation par identifiant de
transaction, et exigence que le virement provienne du compte Binance déclaré par l'utilisateur.

---

## 1. Ce que le dispositif actuel fait bien, et qu'il ne faut pas perdre

Le flux OxaPay repose sur une propriété qui n'est pas évidente au premier regard :

> **Le paiement transporte un identifiant créé AVANT lui.**

`createCryptoInvoice` crée d'abord une `wallet_request`, puis passe son identifiant à OxaPay
comme `order_id`. Le rappel revient avec ce même `order_id` : le rapprochement est donc une
correspondance **exacte et non devinable**, et `reconcileOxapayCallback` ne crédite que si la
demande existe, n'est pas déjà traitée, et que le statut vaut `Paid`.

Même principe du côté SMS : le client déclare son `TransCode` **avant** que le SMS marchand
n'arrive, et `reconcileSms` exige la concordance du txId **et** du montant.

Dans les deux cas, le crédit repose sur un secret que seul le vrai payeur connaît d'avance.

**C'est précisément cette propriété que Binance en compte personnel fait perdre.**

---

## 2. Le problème de fond

Un virement Binance Pay entre particuliers **ne transporte pas d'identifiant de commande
arbitraire**. On ne peut pas demander au payeur d'y attacher notre `requestId`. Le serveur
observe donc, après coup, une transaction entrante caractérisée par :

- un montant,
- un horodatage,
- un identifiant de transaction généré par Binance,
- et — sous réserve de vérification (cf. §4) — un identifiant du payeur.

Le rapprochement doit alors répondre à une question qu'OxaPay n'avait jamais à poser :
**à quel utilisateur appartient ce paiement ?**

### La fraude à couvrir en priorité

Si l'appartenance repose sur un Binance ID que l'utilisateur saisit librement dans son profil,
l'attaque est immédiate :

1. l'attaquant repère un client qui dépose régulièrement ;
2. il déclare **le Binance ID de ce client** dans son propre profil ;
3. au dépôt suivant du client, le rapprochement trouve cet ID et crédite **l'attaquant**.

La victime a payé, un autre est crédité. Aucune alerte : du point de vue du système, tout
concorde. C'est le scénario à éliminer avant d'écrire la moindre ligne.

---

## 3. Trois parades, par solidité croissante

**A. Liaison à la première utilisation.** Le premier compte qui reçoit un dépôt depuis un
Binance ID se l'approprie ; tout changement passe ensuite par un administrateur.
*Simple, mais le tout premier dépôt reste exposé* — l'attaquant qui arrive avant la victime
capte l'ID.

**B. Montant unique déclaré à l'avance.** Le client annonce son dépôt ; le serveur lui renvoie
un montant aux centimes imposés (ex. `25.37` et non `25.00`), enregistré dans la
`wallet_request`. Le rapprochement exige **montant exact + Binance ID**.
*Recommandé* : cela **restaure la propriété perdue au §1** — un secret connu du seul vrai
payeur, non devinable, créé avant le paiement. Et cela réutilise le flux de demande de dépôt
déjà en place, sans rien demander de plus au client.

**C. Vérification par micro-montant.** Le client envoie d'abord une somme symbolique dictée par
le serveur, ce qui lie son Binance ID une fois pour toutes.
*La plus solide, la plus lourde* : elle ajoute une étape avant le premier vrai dépôt.

> **Recommandation : B, avec A en complément.** Le montant unique protège chaque transaction ;
> la liaison protège l'identité dans la durée. Les deux ensemble coûtent peu et se renforcent.

---

## 4. Ce qu'il reste à vérifier — ne pas coder avant

Ces points conditionnent la faisabilité. Je ne les affirme pas : ils doivent être constatés
sur l'API réelle avec les clés du compte, car les endpoints Binance évoluent et la
documentation distingue mal compte personnel et compte marchand.

1. **Le rail.** Binance Pay (transfert interne entre utilisateurs, instantané) et le dépôt
   on-chain sont deux choses différentes. Un dépôt on-chain expose une **adresse** et un hash
   de transaction, **pas d'identifiant Binance** : la parade §3 par Binance ID y serait
   inapplicable telle quelle. Le choix du rail décide de tout le reste.
2. **L'identité du payeur.** Est-elle réellement exposée à un compte **personnel** ? Sous quel
   champ, et est-ce un identifiant stable ? Beaucoup d'endpoints riches en contrepartie sont
   réservés aux comptes marchands — c'est justement ce qu'on n'a pas.
3. **Le mode de récupération.** Un compte personnel n'a pas de webhook : il faudra une fonction
   planifiée qui interroge l'API. À vérifier : la fréquence tolérée par les quotas, et la
   profondeur d'historique consultable. **Conséquence à assumer : le crédit ne sera pas
   instantané**, contrairement à OxaPay.
4. **Les permissions de la clé.** Lecture seule, et surtout **jamais de retrait**. À restreindre
   par IP si Binance le permet pour ce type de compte.

---

## 5. Invariants à ne pas rompre

Quelle que soit l'implémentation retenue :

- **Ne créditer que sur concordance stricte.** En cas de doute, la transaction est journalisée
  et laissée au rapprochement manuel — jamais créditée « au plus probable ».
- **Idempotence sur l'identifiant de transaction Binance**, via `creditWallet(idempotencyKey)`,
  comme pour OxaPay et les SMS. Un même paiement relu à deux sondages ne doit créditer qu'une
  fois.
- **Journaliser tout ce qui est lu**, y compris ce qui n'est pas rapproché — sur le modèle de
  `sms_inbox`. C'est ce registre qui permet de comprendre un litige.
- **Les prix et montants restent résolus côté serveur.** Le client ne propose jamais un montant
  à créditer.
- **La clé API vit dans l'environnement des functions**, jamais dans le dépôt, jamais côté client.

---

## 6. Alternative examinée : Cwallet / CCPayment

**CCPayment est la passerelle marchande de Cwallet** (même éditeur ; la doc CCPayment mentionne
explicitement les transferts « vers un compte Cwallet »). Se présente comme sous licence UE,
80+ pays, 900+ cryptomonnaies.

Deux caractéristiques changent la donne par rapport à Binance en compte personnel.

**a. `merchant_order_id` — la propriété perdue est restaurée.** L'API accepte un identifiant de
commande propre au marchand, unique par commande, et le renvoie dans le webhook. On retrouve
exactement le mécanisme d'OxaPay décrit au §1 : un identifiant créé AVANT le paiement. Toute la
gymnastique du §3 (montant aux centimes imposés, liaison d'identité) devient inutile.

**b. Adresse de dépôt permanente PAR utilisateur.** L'API expose un endpoint rendant une adresse
statique liée à un `user_id`. C'est plus fort encore qu'une facture : **l'attribution devient
structurelle**. Tout dépôt reçu sur cette adresse appartient à cet utilisateur par construction,
sans rapprochement par montant ni par identité d'expéditeur.

> **Cela supprime la fraude du §2.** Il n'y a plus d'identifiant d'expéditeur à revendiquer :
> on ne peut pas s'approprier l'adresse d'un autre, puisqu'on ne choisit pas où le client envoie.

**Webhook.** Signature `SHA-256(APPID + APP_SECRET + timestamp + body)`, transmise dans les
en-têtes `Appid` / `Sign` / `Timestamp`. Le serveur doit répondre `200` avec la chaîne `success`
dans le corps ; à défaut, CCPayment relance jusqu'à **6 fois**. À noter : cela impose de
répondre `success` **après** avoir traité, et de rester idempotent — les relances sont normales,
pas exceptionnelles.

### Ce qui reste à trancher, et c'est décisif

1. **L'ouverture de compte.** C'est la question qui a fait échouer OxaPay. CCPayment annonce des
   prérequis techniques minimes, mais ses conditions prévoient la fourniture de documents au
   titre de la lutte anti-blanchiment. **Compte d'entreprise obligatoire ou non ? KYB exigé ?**
   Rien dans la documentation publique ne le dit clairement.
2. **Haïti est-il éligible ?** Les conditions mentionnent des restrictions régionales sans les
   énumérer. À demander avant tout développement.
3. **Fiabilité de l'éditeur.** Traders Union note CCPayment « Unclear Performance » à 0,7/5. Ce
   type de notation est de qualité inégale et ne vaut pas condamnation, mais confier le flux de
   dépôts d'une boutique mérite d'y regarder de plus près — au minimum un test avec de petits
   montants avant toute mise en service.

### État de mes sources

Les pages de documentation `docs.ccpayment.com` **redirigent désormais vers une application
JavaScript** que je n'ai pas pu lire directement. Les éléments ci-dessus proviennent d'extraits
indexés de la documentation **v1.0**. La version courante de l'API peut donc différer : à
reconfirmer sur la doc en ligne avant d'écrire du code.

---

## 7. Classement des options

| | Attribution du paiement | Crédit instantané | Blocage connu |
|---|---|---|---|
| **CCPayment / Cwallet** | **structurelle** (adresse par utilisateur) | oui (webhook) | ouverture de compte à vérifier |
| OxaPay | par `order_id` | oui (webhook) | **refusé** |
| Binance perso | par montant unique + identité | non (sondage) | identité du payeur peut-être illisible |

**CCPayment est la meilleure piste**, sous la seule réserve de l'ouverture de compte. Binance en
compte personnel reste le repli si CCPayment refuse à son tour : plus fragile, plus lent, et
exigeant les parades du §3 — mais il ne dépend de l'agrément de personne.

---

## 8. Étape suivante recommandée

Interroger l'API avec une clé en lecture seule et **observer ce qu'elle renvoie réellement**
sur une transaction de test : rail utilisé, champs de contrepartie disponibles, format de
l'identifiant de transaction. Une seule transaction réelle lèvera les quatre incertitudes du §4
mieux que n'importe quelle lecture de documentation.

**Mais l'ordre a changé depuis le §6** : commencer par **demander à CCPayment si un compte peut
être ouvert depuis Haïti, et à quelles conditions**. Une réponse positive rend inutile tout le
travail des §3 et §4. Une réponse négative renvoie au repli Binance, et c'est alors seulement
qu'une transaction de test a un intérêt.

Tant que le point 4.2 n'est pas tranché — l'identité du payeur est-elle lisible ? — la parade
§3 ne peut pas être arrêtée, et l'implémentation Binance n'a pas de base solide.
