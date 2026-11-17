# Créer un titulaire

## Le chemin normal : depuis l'application

Un titulaire se crée depuis **Certifiés → Nouveau certifié**, ou directement depuis le
formulaire d'attribution quand la recherche ne trouve personne. Rien d'autre n'est
nécessaire.

Ce qui se passe, dans cet ordre :

1. L'écran appelle `POST /api/titulaires`.
2. Le serveur vérifie que l'appelant porte l'autorisation `creer_titulaires`. Créer un
   compte d'**administration** — gestionnaire ou administrateur — est autre chose, et
   réservé à un administrateur : c'est se donner un collègue de même pouvoir.
3. **Si l'adresse est déjà connue, le compte existant est renvoyé et rien n'est créé.**
   Un doublon donnerait deux espaces personnels à la même personne, dont un vide, et ses
   certificats seraient répartis entre les deux. La comparaison ignore la casse :
   `Yao@example.ci` et `yao@example.ci` sont la même personne.
4. Sinon, le profil est inséré avec un identifiant public unique, et un lien
   d'invitation est créé — valable sept jours, une seule fois.
5. Le courrier part. Le titulaire suit le lien, atterrit sur `/nouveau-mot-de-passe`,
   choisit son mot de passe, et sa session s'ouvre dans la foulée.

**Aucun mot de passe n'est produit ni envoyé.** Un mot de passe provisoire expédié par
courrier reste lisible dans la boîte de réception, dans les sauvegardes du serveur de
messagerie, et souvent pour toujours. Le compte existe donc avant d'avoir un mot de
passe, et ne peut pas se connecter tant que son titulaire n'en a pas choisi un.

### Si l'invitation ne part pas

Le compte est créé quand même, et l'écran le dit. Deux issues :

- l'administrateur **relance l'invitation** depuis la fiche du titulaire ;
- le titulaire passe par « Mot de passe oublié » sur la page de connexion.

Bloquer la création parce qu'un courrier n'a pas pu partir serait pire : la certification
ne pourrait pas être délivrée.

Sans `RESEND_API_KEY` sur le serveur, aucun courrier ne part — c'est le cas en
développement. Le lien est alors **imprimé dans le journal du serveur**, et la
notification apparaît « en attente » dans l'écran Notifications. Rien ne prétend avoir
été envoyé.

## Le seul cas qui reste manuel : le premier administrateur

Il n'y a personne pour l'inviter.

```bash
npm run base -- admin direction@vizdata.ci Fabrice BOH
```

La commande crée le compte s'il n'existe pas, le promeut s'il existe déjà, et imprime un
lien d'invitation. Elle ne demande ni ne fixe de mot de passe : un mot de passe saisi en
ligne de commande resterait dans l'historique du shell, souvent pour toujours.

En production, pensez à `VIZDATA_SITE_URL`, sans quoi le lien imprimé pointera vers
`localhost` :

```bash
VIZDATA_DB=/var/lib/vizdata-certify/certify.db VIZDATA_SITE_URL=https://certify.vizdata.ci npm run base -- admin direction@vizdata.ci
```

Transmettez le lien par un canal sûr : il ouvre le compte.

## Changer l'adresse e-mail d'un compte

Seul un administrateur le peut, depuis la fiche du titulaire. L'adresse sert à la fois
d'identifiant de connexion et de destinataire : il n'y a plus deux endroits à tenir
d'accord, comme c'était le cas quand l'identité et le profil vivaient dans des tables
séparées.

Le titulaire est prévenu par courrier de la modification.

## Ce qu'un titulaire ne peut pas faire lui-même

- **Changer son adresse e-mail.** Elle identifie le compte.
- **Changer son rôle ou ses autorisations.**
- **Se réactiver après désactivation.**

Ces trois refus sont prononcés par le serveur, sur chaque route, et pas seulement par
l'écran : une requête HTTP envoyée à la main est refusée de la même façon.

Il peut modifier son prénom, son nom, son téléphone, son profil LinkedIn, la visibilité
de son profil public, et son mot de passe — ce dernier en fournissant l'ancien.

## Désactiver, jamais supprimer

Un compte se désactive depuis **Utilisateurs & rôles**. Il ne se supprime pas :
`certificates.user_id` est en RESTRICT, et la base refuserait. C'est voulu — effacer un
titulaire effacerait la trace de ce que VIZDATA a certifié.

Désactiver **ferme ses sessions dans l'instant**, y compris celles déjà ouvertes sur
d'autres appareils. Sans cela, la mesure ne prendrait effet qu'à la prochaine
déconnexion.

Ses certificats restent enregistrés et **demeurent vérifiables publiquement** : retirer
un accès n'annule pas une certification délivrée. Pour retirer un certificat, il faut le
révoquer, avec un motif.

Enfin, on ne retire pas ses droits au **dernier administrateur actif** : la plateforme se
retrouverait sans personne pour la gouverner, et la seule issue serait une écriture
directe dans le fichier de base.
