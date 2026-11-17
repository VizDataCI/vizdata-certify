<?php
/* Qui a le droit de quoi.
 *
 * Ce module porte à lui seul ce que Postgres tenait par ses politiques RLS.
 * S'il se trompe, rien ne rattrape l'erreur : il n'y a plus de seconde ligne
 * de défense dans la base. C'est la pièce la plus sensible du serveur.
 *
 * Trois partis pris en conséquence :
 *
 * 1. TOUT PASSE PAR ICI. Aucune route n'écrit sans avoir appelé l'une de ces
 *    méthodes. Une autorisation vérifiée à deux endroits finit toujours par
 *    être vérifiée différemment.
 *
 * 2. ON LÈVE, ON NE REND PAS UN BOOLÉEN. Une méthode qui rend `false` se
 *    laisse oublier — un `if` sans `else` est une faille muette. Une méthode
 *    qui lève interrompt la route, et le routeur traduit le refus en code HTTP.
 *
 * 3. LE VOCABULAIRE EST CELUI DE L'INTERFACE. Les clés d'autorisation sont
 *    exactement celles de src/lib/permissions.js, et un test du dépôt vérifie
 *    que les deux listes coïncident. Les redéclarer sans contrôle garantirait
 *    qu'elles divergent un jour : l'écran cacherait une action que le serveur
 *    accepte — ou, bien pire, en proposerait une qu'il refuse.
 *
 * La règle de fond : l'interface ne protège rien, elle évite de proposer
 * l'inutile. Le serveur, lui, décide.
 */

declare(strict_types=1);

/** Refus explicite, porteur de son code HTTP. */
final class Refus extends RuntimeException
{
    public function __construct(public readonly int $statut, string $message)
    {
        parent::__construct($message);
    }
}

final class Autorisations
{
    /** Les quatre autorisations qu'un administrateur accorde à un gestionnaire. */
    public const AUTORISATIONS = [
        'creer_titulaires'       => 'créer des certifiés',
        'attribuer_certificats'  => 'attribuer des certifications',
        'revoquer_certificats'   => 'révoquer des certificats',
        'exporter_donnees'       => 'exporter les données',
    ];

    public const ROLES = ['ADMIN', 'MANAGER', 'CERTIFIED'];

    /* Les champs qu'un compte peut modifier sur lui-même. */
    private const CHAMPS_LIBRES = ['first_name', 'last_name', 'phone', 'linkedin_url', 'public_profile', 'avatar_url'];

    /* Les champs qui donnent du pouvoir : les modifier, c'est changer qui peut
       quoi. Administrateur seulement, et jamais sur soi-même pour les deux
       premiers. */
    private const CHAMPS_PRIVILEGIES = ['role', 'permissions', 'account_status', 'email'];

    /* --- lecture du rôle -------------------------------------------------- */

    public static function estAdmin(?array $acteur): bool
    {
        return $acteur !== null
            && ($acteur['role'] ?? '') === 'ADMIN'
            && ($acteur['account_status'] ?? 'ACTIVE') !== 'DISABLED';
    }

    public static function estAdministration(?array $acteur): bool
    {
        return $acteur !== null
            && in_array($acteur['role'] ?? '', ['ADMIN', 'MANAGER'], true)
            && ($acteur['account_status'] ?? 'ACTIVE') !== 'DISABLED';
    }

    /** Vrai si le compte porte l'autorisation nommée. L'administrateur les a toutes. */
    public static function peut(?array $acteur, string $cle): bool
    {
        if (!self::estAdministration($acteur)) {
            return false;
        }
        if ($acteur['role'] === 'ADMIN') {
            return true;
        }
        $permissions = $acteur['permissions'] ?? [];
        return !empty($permissions[$cle]);
    }

    /* --- exigences -------------------------------------------------------- */

    /** Une session ouverte, sur un compte actif. */
    public static function exigerSession(?array $acteur): array
    {
        if ($acteur === null) {
            throw new Refus(401, 'Authentification requise.');
        }
        if (($acteur['account_status'] ?? 'ACTIVE') === 'DISABLED') {
            /* Le compte garde son rôle — on ne rétrograde pas quelqu'un qu'on
               suspend — mais la suspension doit être effective immédiatement. */
            throw new Refus(403, 'Ce compte a été désactivé. Contactez VIZDATA.');
        }
        return $acteur;
    }

    public static function exigerAdmin(?array $acteur): array
    {
        self::exigerSession($acteur);
        if (!self::estAdmin($acteur)) {
            throw new Refus(403, 'Action réservée à un administrateur.');
        }
        return $acteur;
    }

    public static function exigerAdministration(?array $acteur): array
    {
        self::exigerSession($acteur);
        if (!self::estAdministration($acteur)) {
            throw new Refus(403, "Action réservée à l'administration.");
        }
        return $acteur;
    }

    public static function exigerAutorisation(?array $acteur, string $cle): array
    {
        self::exigerSession($acteur);
        if (!array_key_exists($cle, self::AUTORISATIONS)) {
            /* Une clé inconnue est une faute de frappe dans le code appelant.
               La traduire en « refusé » masquerait le bogue ; en « autorisé »,
               ce serait une faille. On lève bruyamment. */
            throw new LogicException("Autorisation inconnue : $cle");
        }
        if (!self::peut($acteur, $cle)) {
            throw new Refus(403, "Votre compte n'a pas l'autorisation de " . self::AUTORISATIONS[$cle] . '.');
        }
        return $acteur;
    }

    /* --- lecture ---------------------------------------------------------- */

    /** Un titulaire lit les siens ; l'administration lit tout. */
    public static function exigerLectureCertificat(?array $acteur, ?array $certificat): array
    {
        self::exigerSession($acteur);
        if ($certificat === null) {
            throw new Refus(404, 'Certificat introuvable.');
        }
        if (self::estAdministration($acteur) || $certificat['user_id'] === $acteur['id']) {
            return $certificat;
        }
        /* 404 plutôt que 403 : répondre « interdit » confirmerait l'existence
           du certificat à qui n'a pas le droit de le savoir. */
        throw new Refus(404, 'Certificat introuvable.');
    }

    public static function exigerLectureCompte(?array $acteur, ?array $cible): array
    {
        self::exigerSession($acteur);
        if ($cible === null) {
            throw new Refus(404, 'Compte introuvable.');
        }
        if ($cible['id'] === $acteur['id'] || self::estAdministration($acteur)) {
            return $cible;
        }
        throw new Refus(404, 'Compte introuvable.');
    }

    /* --- écriture sur un compte ------------------------------------------- */

    /**
     * Le garde-fou contre l'élévation de privilèges.
     *
     * Sans ce contrôle, un gestionnaire autorisé à corriger la fiche d'un
     * titulaire pourrait envoyer la même requête sur SA PROPRE fiche en y
     * glissant `role: 'ADMIN'`. C'est l'élévation la plus banale qui soit, et
     * elle ne demande aucun outil particulier : une requête HTTP.
     *
     * @return array les champs retenus
     */
    public static function exigerEcritureCompte(?array $acteur, ?array $cible, array $champs): array
    {
        self::exigerSession($acteur);
        if ($cible === null) {
            throw new Refus(404, 'Compte introuvable.');
        }

        $demandes = array_keys($champs);
        $privilegies = array_values(array_intersect($demandes, self::CHAMPS_PRIVILEGIES));
        $inconnus = array_values(array_diff($demandes, self::CHAMPS_LIBRES, self::CHAMPS_PRIVILEGIES));

        if ($inconnus) {
            /* On refuse plutôt que d'ignorer : un champ silencieusement écarté
               laisse croire que la modification a eu lieu — et le jour où ce
               champ existera, il passera sans contrôle. */
            throw new Refus(403, 'Champ non modifiable : ' . implode(', ', $inconnus) . '.');
        }

        if ($privilegies) {
            if (!self::estAdmin($acteur)) {
                if (array_intersect($privilegies, ['role', 'permissions'])) {
                    throw new Refus(403, 'Seul un administrateur peut changer un rôle ou des autorisations.');
                }
                if (in_array('account_status', $privilegies, true)) {
                    throw new Refus(403, 'Seul un administrateur peut activer ou désactiver un compte.');
                }
                throw new Refus(403, 'Seul un administrateur peut changer une adresse e-mail.');
            }
            /* Même administrateur, on ne se modifie pas soi-même sur ces deux
               points : le dernier administrateur pourrait se retirer ses droits
               et verrouiller la plateforme, ou se désactiver et ne plus pouvoir
               se reconnecter. Il faut un second administrateur pour le faire. */
            if ($cible['id'] === $acteur['id']) {
                if (array_intersect($privilegies, ['role', 'permissions'])) {
                    throw new Refus(403, "Vous ne pouvez pas modifier votre propre rôle. Un autre administrateur doit s'en charger.");
                }
                if (in_array('account_status', $privilegies, true)) {
                    throw new Refus(403, 'Vous ne pouvez pas désactiver votre propre compte.');
                }
            }
            return $champs;
        }

        if ($cible['id'] === $acteur['id'] || self::estAdministration($acteur)) {
            return $champs;
        }
        throw new Refus(403, "Cette action n'est pas autorisée pour votre compte.");
    }

    /**
     * Créer un compte.
     *
     * Créer un titulaire demande `creer_titulaires`. Créer un compte
     * d'administration est autre chose : c'est se donner un collègue de même
     * pouvoir. Les confondre reviendrait à laisser un gestionnaire se fabriquer
     * un second compte, administrateur celui-là.
     */
    public static function exigerCreationCompte(?array $acteur, ?string $role): array
    {
        self::exigerAutorisation($acteur, 'creer_titulaires');
        if ($role !== null && $role !== 'CERTIFIED' && !self::estAdmin($acteur)) {
            throw new Refus(403, "Seul un administrateur peut créer un compte d'administration.");
        }
        return $acteur;
    }

    /**
     * Vérifie qu'il restera un administrateur actif.
     *
     * Appelé avant toute rétrogradation ou désactivation. Sans lui, la
     * plateforme peut se retrouver sans personne pour la gouverner — et la
     * seule issue serait une écriture directe dans le fichier de base.
     */
    public static function exigerDernierAdministrateur(string $cibleId): void
    {
        $restants = (int) Base::valeur(
            "select count(*) from users where role = 'ADMIN' and account_status = 'ACTIVE' and id <> ?",
            [$cibleId]
        );
        if ($restants === 0) {
            throw new Refus(
                403,
                "C'est le dernier administrateur actif. Nommez-en un autre avant de retirer celui-ci, "
                . "sans quoi plus personne ne pourrait administrer la plateforme."
            );
        }
    }
}
