# Créer un titulaire

`public.users.id` référence `auth.users(id)`. Une ligne de profil ne peut donc pas
exister sans compte d'authentification, et créer un tel compte demande la clé
`service_role` — celle qui contourne toutes les politiques RLS. Elle n'a rien à faire
dans une application front, qui est publique par nature.

Deux voies, selon le volume.

## 1. Depuis la console — sans rien déployer

C'est la voie recommandée tant que les promotions restent de taille humaine.

1. **Authentication → Users → Add user**, avec l'adresse du titulaire.
   Cochez l'envoi d'une invitation pour qu'il choisisse son mot de passe.
2. Relevez l'`id` du compte créé.
3. **Table Editor → users → Insert row**, en reprenant **exactement** cet `id` :

```sql
insert into public.users (id, first_name, last_name, email, username, public_profile, role)
values (
  '00000000-0000-0000-0000-000000000000',  -- l'id du compte d'authentification
  'Awa', 'DIALLO', 'awa.diallo@example.ci',
  'awa-diallo',
  false,
  'CERTIFIED'
);
```

`username` sert l'adresse publique `/u/{identifiant}` : minuscules, sans accent, tirets
en séparateur. Il doit rester unique.

Le titulaire peut ensuite se voir délivrer des certificats depuis l'administration, et
l'import CSV l'acceptera.

## 2. Par une Edge Function — pour l'import en masse

Nécessaire seulement si vous voulez que l'import CSV crée les comptes lui-même.

La fonction détient la clé `service_role`, vérifie que l'appelant est administrateur,
crée le compte puis le profil. Le principe :

```ts
// supabase/functions/creer-titulaire/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const jeton = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jeton) return new Response("Non authentifié", { status: 401 });

  // Deux clients : l'un pour vérifier l'appelant, l'autre pour agir.
  const appelant = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: `Bearer ${jeton}` } } },
  );

  const { data: estAdmin } = await appelant.rpc("is_admin");
  if (!estAdmin) return new Response("Réservé aux administrateurs", { status: 403 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),  // jamais côté navigateur
  );

  const { first_name, last_name, email, username } = await req.json();

  const { data: compte, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) return new Response(error.message, { status: 400 });

  const { error: erreurProfil } = await admin.from("users").insert({
    id: compte.user.id,
    first_name, last_name, email, username,
    public_profile: false,
    role: "CERTIFIED",
  });
  if (erreurProfil) return new Response(erreurProfil.message, { status: 400 });

  return Response.json({ id: compte.user.id });
});
```

Points de vigilance :

- **La vérification `is_admin()` n'est pas décorative.** Sans elle, n'importe quel
  visiteur muni de la clé publiable pourrait créer des comptes en masse.
- `SUPABASE_SERVICE_ROLE_KEY` est injectée automatiquement dans l'environnement des
  Edge Functions : elle ne doit être écrite nulle part ailleurs.
- Le déploiement se fait par `npx supabase functions deploy creer-titulaire`, ce qui
  suppose `supabase login` et un lien vers le projet.

Côté application, il resterait à appeler cette fonction depuis `src/data/api.js` puis à
lever le refus affiché par le formulaire et par l'import lorsqu'une adresse est inconnue.
