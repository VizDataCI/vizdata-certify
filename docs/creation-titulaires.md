# Créer un titulaire

> Ce document décrivait une limite ; elle est levée. Il décrit désormais le chemin
> normal, et les deux cas qui restent manuels.

## Le chemin normal : depuis l'application

Un titulaire se crée depuis **Certifiés → Nouveau certifié**, ou directement depuis le
formulaire d'attribution quand la recherche ne trouve personne. Rien d'autre n'est
nécessaire : son compte d'accès s'ouvre et son invitation part.

Ce qui se passe réellement, dans cet ordre :

1. L'écran appelle la fonction Edge `inviter-titulaire`.
2. La fonction interroge la base **avec le jeton de l'appelant**, donc sous RLS, pour
   vérifier qu'il porte l'autorisation `creer_titulaires`.
3. Si l'adresse est déjà connue, le profil existant est renvoyé et **rien n'est créé**.
4. Sinon, `inviteUserByEmail` crée le compte **et** envoie le lien d'activation.
5. Le profil est inséré dans `public.users`, avec `must_change_password = true`.
6. Le titulaire suit le lien, atterrit sur `/nouveau-mot-de-passe` et choisit son mot
   de passe.

**Aucun mot de passe n'est produit ni envoyé.** C'est la raison du choix
d'`inviteUserByEmail` plutôt que de `createUser` : un mot de passe provisoire expédié
par courrier reste lisible dans la boîte de réception, dans les sauvegardes du serveur
de messagerie, et souvent pour toujours.

### Pourquoi une fonction Edge

`public.users.id` référence `auth.users(id)`. Créer un titulaire suppose donc de créer
d'abord un compte d'authentification, ce que la clé publiable ne permet pas — et ne doit
pas permettre. Seule la clé secrète le peut, et elle contourne toutes les politiques
RLS : elle n'a aucune raison d'approcher un navigateur, où tout ce qui est embarqué est
lisible.

La fonction est donc le seul endroit où cette clé existe, et elle n'expose qu'un geste
très borné : « crée ce titulaire », après avoir vérifié elle-même que l'appelant en a
le droit.

### Si l'invitation ne part pas

Le compte est tout de même créé, et l'écran le dit. Le titulaire peut alors passer par
« Mot de passe oublié » sur la page de connexion. Bloquer la création parce qu'un
courrier n'a pas pu partir serait pire : la certification ne pourrait pas être délivrée.

Les causes habituelles : quota du mailer par défaut de Supabase (quelques messages par
heure), ou SMTP personnalisé mal configuré. Les envois en souffrance sont visibles dans
**Notifications**.

## Les deux cas qui restent manuels

### Le premier administrateur

Il n'y a personne pour l'inviter. Depuis la console Supabase :

1. **Authentication → Users → Invite user**, avec son adresse.
2. Relevez l'identifiant du compte créé.
3. Dans **SQL Editor** :

```sql
insert into public.users (id, email, first_name, last_name, username, role, account_status)
values (
  'COLLEZ-ICI-L-IDENTIFIANT',
  'direction@vizdata.ci',
  'Direction',
  'VIZDATA',
  'vizdata',
  'ADMIN',
  'ACTIVE'
);
```

Un compte authentifié sans ligne dans `public.users` est refusé à la connexion et
immédiatement déconnecté : l'application ne laisse pas de session orpheline.

### Changer l'adresse e-mail d'un compte

Un administrateur peut changer l'adresse **du profil** depuis l'application. L'adresse
qui sert à **se connecter** appartient à l'authentification : elle se change dans
**Authentication → Users** de la console Supabase.

Les deux doivent rester cohérentes, sans quoi la personne se connecte avec une adresse
et en voit une autre dans son profil. C'est la seule opération où les deux côtés
demandent une intervention distincte.

## Ce qu'un titulaire ne peut pas faire lui-même

- **Changer son adresse e-mail.** Elle identifie le compte. Le déclencheur
  `guard_user_privileges` refuse l'écriture côté base, pas seulement à l'écran.
- **Changer son rôle ou ses autorisations.** Même déclencheur.
- **Se réactiver après désactivation.** Même déclencheur.

Il peut modifier son prénom, son nom, son téléphone, son profil LinkedIn, la visibilité
de son profil public, et son mot de passe — ce dernier en fournissant l'ancien.
