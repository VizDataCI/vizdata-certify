/* Client Supabase.

   Les clés sont lues dans l'environnement Vite. Tant qu'elles ne sont pas
   renseignées, `supabase` vaut null et l'application reste en mode
   démonstration : la connexion accepte n'importe quel mot de passe et le
   registre vit dans le navigateur. Voir .env.example. */

import { createClient } from "@supabase/supabase-js";

/* Accès statique délibéré : Vite substitue ces deux expressions à la
   compilation. Sans clés, isAuthConfigured devient une constante fausse et
   le SDK Supabase (≈200 ko) est éliminé du bundle de démonstration. */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Vrai lorsque le projet Supabase est configuré : l'authentification est alors réelle. */
const isAuthConfigured = Boolean(url && anonKey);

const supabase = isAuthConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export { supabase, isAuthConfigured };
