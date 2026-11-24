<?php
/* Mots de passe, sessions et liens à usage unique.
 *
 * Quatre décisions qui comptent, avec leurs raisons — c'est le genre de code
 * qu'on relit deux ans plus tard sans se souvenir pourquoi il est ainsi.
 *
 * 1. `password_hash` DE PHP, PAS UN HACHAGE MAISON. Il choisit Argon2id quand
 *    la plateforme le propose, bcrypt sinon, gère le sel lui-même et inscrit
 *    les paramètres dans l'empreinte. Réimplémenter scrypt à la main pour
 *    coller au serveur Node aurait été du code cryptographique écrit sans
 *    revue : le pire endroit pour faire preuve d'originalité.
 *
 * 2. LES PARAMÈTRES VOYAGENT AVEC L'EMPREINTE. Le coût devra être relevé dans
 *    quelques années ; `password_needs_rehash` permet alors de recalculer
 *    chaque empreinte à la volée, à la prochaine connexion. Sans cela, relever
 *    le coût invaliderait tous les comptes d'un coup.
 *
 * 3. LE CALCUL A LIEU MÊME QUAND L'ADRESSE EST INCONNUE. Sans cela, une
 *    réponse immédiate trahirait l'absence du compte, et l'on pourrait
 *    énumérer le registre en essayant des adresses.
 *
 * 4. ON NE STOCKE JAMAIS UN JETON, SEULEMENT SON EMPREINTE. Ni pour les
 *    sessions, ni pour les liens. Le fichier de base est copié pour les
 *    sauvegardes : s'il contenait des jetons utilisables, toute sauvegarde
 *    égarée donnerait accès aux comptes.
 */

declare(strict_types=1);

final class Comptes
{
    public const DUREE_SESSION = 30 * 24 * 3600;        // trente jours
    public const DUREE_INVITATION = 7 * 24 * 3600;      // sept jours
    public const DUREE_REINITIALISATION = 3600;         // une heure

    /**
     * Combien de temps une session vit, selon ce qu'elle ouvre.
     *
     * Toutes les sessions duraient trente jours, de l'administrateur qui tient
     * le registre entier au titulaire qui vient voir son diplôme deux fois par
     * an. C'est le compte le plus puissant qui restait ouvert le plus
     * longtemps : un cookie dérobé sur un poste partagé — et à Abidjan, le
     * poste est souvent partagé — donnait un mois d'accès à tout le registre.
     *
     * Deux limites, et elles ne disent pas la même chose :
     *   * `vie` est la durée absolue. Passée celle-ci, la session tombe, même
     *     utilisée toutes les heures : une session éternelle n'est plus une
     *     session, c'est un mot de passe permanent.
     *   * `repos` coupe une session LAISSÉE ouverte. Elle ne gêne pas celui
     *     qui travaille, elle ferme la porte derrière celui qui est parti.
     *
     * Un titulaire n'a pas de coupure d'inactivité : il visite rarement, son
     * espace ne montre que ses propres certificats, et le déconnecter entre
     * deux visites ne protégerait rien tout en lui compliquant la vie.
     */
    /** Inactivité tolérée avant déconnexion, et préavis donné à l'écran. */
    public const INACTIVITE = 600;          // dix minutes
    public const INACTIVITE_PREAVIS = 120;  // les deux dernières, annoncées

    /**
     * La marge que le serveur laisse au-delà des dix minutes.
     *
     * C'est l'écran qui déconnecte, parce que lui seul sait qu'on lit une page
     * sans rien demander au serveur. Le serveur coupe un peu après, en
     * filet : sans cette marge, il tomberait pendant que l'écran affiche son
     * préavis, et le compte à rebours mentirait.
     */
    public const INACTIVITE_GRACE = 120;

    public const DUREES = [
        'ADMIN'     => ['vie' => 7 * 24 * 3600,  'repos' => self::INACTIVITE + self::INACTIVITE_GRACE],
        'MANAGER'   => ['vie' => 7 * 24 * 3600,  'repos' => self::INACTIVITE + self::INACTIVITE_GRACE],
        'CERTIFIED' => ['vie' => 30 * 24 * 3600, 'repos' => self::INACTIVITE + self::INACTIVITE_GRACE],
    ];

    /* --- tentatives de connexion -------------------------------------------
       Cinq échecs ferment le compte pour un quart d'heure. Avant d'en arriver
       là, chaque échec impose une attente qui s'allonge : une seconde, deux,
       cinq, quinze. C'est ce qui rend l'essai en masse sans intérêt, et c'est
       presque indolore pour qui s'est simplement trompé de touche — la
       première faute ne coûte rien, la seconde une seconde.

       L'attente est RENDUE, pas dormie : faire patienter le serveur occuperait
       un processus PHP pendant que l'attaquant, lui, n'attend rien. */
    public const ECHECS_MAX = 5;
    public const BLOCAGE = 900;             // un quart d'heure
    public const DELAIS = [0, 1, 2, 5, 15]; // par nombre d'échecs déjà commis

    /** Durées applicables à un rôle. Un rôle inconnu est traité au plus strict. */
    public static function dureesDe(?string $role): array
    {
        return self::DUREES[$role ?? ''] ?? self::DUREES['ADMIN'];
    }

    /** Empreinte de référence, pour égaliser le temps de réponse. */
    private static ?string $leurre = null;

    /* --- mots de passe ---------------------------------------------------- */

    private static function algorithme(): string
    {
        /* Argon2id est préférable quand il est compilé dans PHP ; bcrypt reste
           un choix solide et il est toujours là. On ne force pas : un
           hébergement qui ne propose pas Argon2 ne doit pas refuser les
           connexions. */
        return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    }

    public static function hacherMotDePasse(string $motDePasse): string
    {
        $empreinte = password_hash($motDePasse, self::algorithme());
        if (!is_string($empreinte) || $empreinte === '') {
            throw new RuntimeException("Le mot de passe n'a pas pu être haché.");
        }
        return $empreinte;
    }

    public static function verifierMotDePasse(string $motDePasse, ?string $stocke): bool
    {
        if ($stocke === null || $stocke === '') {
            return false;
        }
        return password_verify($motDePasse, $stocke);
    }

    /** Exigences minimales — les mêmes que src/lib/mot-de-passe.js. */
    public static function qualiteMotDePasse(?string $mdp): string
    {
        $v = $mdp ?? '';
        if (mb_strlen($v) < 8) {
            return 'Le mot de passe doit comporter au moins huit caractères.';
        }
        if (!preg_match('/[a-zA-Z]/', $v)) {
            return 'Le mot de passe doit comporter au moins une lettre.';
        }
        if (!preg_match('/[0-9]/', $v)) {
            return 'Le mot de passe doit comporter au moins un chiffre.';
        }
        return '';
    }

    /* --- jetons ------------------------------------------------------------ */

    /** Secret aléatoire de 256 bits, transportable dans une URL ou un cookie. */
    public static function nouveauSecret(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    /** Empreinte d'un jeton. SHA-256 suffit : un secret tiré au hasard sur
     *  256 bits n'a pas de faible entropie à protéger, contrairement à un mot
     *  de passe choisi par un humain. */
    public static function empreinteJeton(string $jeton): string
    {
        return rtrim(strtr(base64_encode(hash('sha256', $jeton, true)), '+/', '-_'), '=');
    }

    /* --- sessions ---------------------------------------------------------- */

    /**
     * Ouvre une session et rend le secret à poser dans le cookie.
     *
     * Le secret n'est rendu qu'ici, une seule fois : la base n'en garde que
     * l'empreinte, et il est donc impossible de le retrouver ensuite — y
     * compris pour nous.
     */
    public static function ouvrirSession(string $utilisateurId, ?string $agent = null, ?int $duree = null): array
    {
        $compte = Base::un('select role, failed_attempts from users where id = ?', [$utilisateurId]);
        $duree ??= self::dureesDe($compte['role'] ?? null)['vie'];

        $secret = self::nouveauSecret();
        Base::ecrire(
            'insert into sessions (id, token_hash, user_id, expires_at, user_agent) values (?, ?, ?, ?, ?)',
            [Base::uid(), self::empreinteJeton($secret), $utilisateurId, Base::dans($duree), $agent]
        );
        /* Le compteur d'échecs est relevé AVANT d'être remis à zéro : c'est ce
           chiffre qu'on annonce à celui qui entre. Remis à zéro ensuite, il
           repart pour la prochaine absence. */
        $echecs = (int) ($compte['failed_attempts'] ?? 0);
        Base::ecrire(
            'update users set last_login_at = ?, failed_attempts = 0 where id = ?',
            [Base::maintenant(), $utilisateurId]
        );
        return ['secret' => $secret, 'expire' => Base::dans($duree), 'echecs' => $echecs];
    }

    /**
     * Compte associé à un cookie de session, ou null.
     *
     * Les sessions expirées sont écartées à la lecture plutôt que par une
     * tâche de ménage : une session périmée ne doit pas ouvrir de porte, même
     * si personne n'est passé la supprimer.
     */
    public static function sessionDepuisSecret(?string $secret): ?array
    {
        if ($secret === null || $secret === '') {
            return null;
        }
        $ligne = Base::un(
            'select s.id as session_id, s.expires_at as session_expire,
                    s.last_seen as session_vue, u.*
               from sessions s join users u on u.id = s.user_id
              where s.token_hash = ?',
            [self::empreinteJeton($secret)]
        );
        if ($ligne === null) {
            return null;
        }
        /* Deux motifs de refus, et la session est supprimée dans les deux cas :
           un cookie qui ne vaut plus rien ne doit pas rester une ligne en base
           que quelqu'un pourrait un jour prolonger. */
        $repos = self::dureesDe($ligne['role'] ?? null)['repos'];
        $abandonnee = $repos > 0
            && (string) ($ligne['session_vue'] ?? '') < Base::dans(-$repos);

        if ($ligne['session_expire'] <= Base::maintenant() || $abandonnee) {
            Base::ecrire('delete from sessions where id = ?', [$ligne['session_id']]);
            return null;
        }
        Base::ecrire('update sessions set last_seen = ? where id = ?', [Base::maintenant(), $ligne['session_id']]);
        return self::normaliser($ligne);
    }

    /**
     * Les sessions ouvertes d'un compte, la courante d'abord.
     *
     * Le secret n'est jamais rendu : seulement de quoi reconnaître l'appareil
     * — quand elle a été ouverte, quand elle a servi la dernière fois, et le
     * navigateur annoncé. C'est assez pour repérer une session qu'on ne
     * reconnaît pas, et trop peu pour s'en servir.
     */
    public static function sessionsDe(string $utilisateurId, ?string $secretCourant = null): array
    {
        $empreinte = ($secretCourant === null || $secretCourant === '')
            ? '' : self::empreinteJeton($secretCourant);

        /* La liste ne montre que ce qui ouvrirait VRAIMENT la porte : une
           session au repos depuis plus longtemps que la règle est déjà
           refusée, même si sa ligne survit en base jusqu'à ce qu'on y touche.
           L'afficher comme « connectée » ferait compter dix appareils à qui
           n'en a qu'un, et le chiffre inquiéterait pour rien. */
        $role = Base::un('select role from users where id = ?', [$utilisateurId])['role'] ?? null;
        $repos = self::dureesDe($role)['repos'];
        $seuil = $repos > 0 ? Base::dans(-$repos) : '';

        $lignes = Base::tous(
            'select id, token_hash, created_at, last_seen, expires_at, user_agent
               from sessions
              where user_id = ? and expires_at > ? and last_seen > ?
              order by last_seen desc',
            [$utilisateurId, Base::maintenant(), $seuil]
        );

        return array_map(fn (array $s): array => [
            'id'         => $s['id'],
            'courante'   => $s['token_hash'] === $empreinte,
            'created_at' => $s['created_at'],
            'last_seen'  => $s['last_seen'],
            'expires_at' => $s['expires_at'],
            'appareil'   => self::appareil((string) ($s['user_agent'] ?? '')),
        ], $lignes);
    }

    /**
     * Un nom d'appareil lisible, tiré de l'agent annoncé.
     *
     * L'agent brut — « Mozilla/5.0 (Windows NT 10.0; Win64; x64) … » — ne dit
     * rien à personne. Ce qu'il faut pour reconnaître SA session, c'est le
     * système et le navigateur, et rien de plus : ni version, ni moteur de
     * rendu, qui ne feraient qu'allonger la ligne.
     */
    private static function appareil(string $agent): string
    {
        if (trim($agent) === '') {
            return 'Appareil inconnu';
        }
        $systeme = match (true) {
            str_contains($agent, 'Android')                            => 'Android',
            (bool) preg_match('/iPhone|iPad|iPod/', $agent)            => 'iPhone ou iPad',
            str_contains($agent, 'Windows')                            => 'Windows',
            str_contains($agent, 'Mac OS X')                           => 'Mac',
            (bool) preg_match('/Linux|X11/', $agent)                   => 'Linux',
            default                                                    => 'Appareil inconnu',
        };
        /* L'ordre compte : Chrome, Edge et Opera s'annoncent tous « Chrome »,
           et Safari est annoncé par Chrome aussi. On teste du plus précis au
           plus général. */
        $navigateur = match (true) {
            str_contains($agent, 'Edg/')                               => 'Edge',
            (bool) preg_match('/OPR\/|Opera/', $agent)                 => 'Opera',
            str_contains($agent, 'SamsungBrowser')                     => 'Samsung Internet',
            str_contains($agent, 'Firefox')                            => 'Firefox',
            str_contains($agent, 'Chrome')                             => 'Chrome',
            str_contains($agent, 'Safari')                             => 'Safari',
            default                                                    => '',
        };
        return $navigateur === '' ? $systeme : "$navigateur sur $systeme";
    }

    public static function fermerSession(?string $secret): int
    {
        if ($secret === null || $secret === '') {
            return 0;
        }
        return Base::ecrire('delete from sessions where token_hash = ?', [self::empreinteJeton($secret)]);
    }

    /** Ferme toutes les sessions d'un compte, sauf éventuellement la courante. */
    public static function fermerToutesSessions(string $utilisateurId, ?string $sauf = null): int
    {
        if ($sauf !== null && $sauf !== '') {
            return Base::ecrire(
                'delete from sessions where user_id = ? and token_hash <> ?',
                [$utilisateurId, self::empreinteJeton($sauf)]
            );
        }
        return Base::ecrire('delete from sessions where user_id = ?', [$utilisateurId]);
    }

    /** Supprime sessions et jetons périmés. Appelé de temps en temps, au hasard. */
    public static function menage(): array
    {
        $t = Base::maintenant();
        return [
            'sessions' => Base::ecrire('delete from sessions where expires_at <= ?', [$t]),
            'jetons'   => Base::ecrire('delete from jetons where expires_at <= ? or used_at is not null', [$t]),
        ];
    }

    /* --- liens à usage unique ---------------------------------------------- */

    /**
     * Crée un lien et rend son secret.
     *
     * Les jetons antérieurs du même genre sont supprimés : demander un second
     * lien doit invalider le premier, sans quoi deux liens valides circulent et
     * le plus ancien — potentiellement lu par quelqu'un d'autre — reste
     * utilisable.
     */
    public static function creerJeton(string $utilisateurId, string $kind): array
    {
        $duree = $kind === 'INVITATION' ? self::DUREE_INVITATION : self::DUREE_REINITIALISATION;
        Base::ecrire('delete from jetons where user_id = ? and kind = ?', [$utilisateurId, $kind]);

        $secret = self::nouveauSecret();
        Base::ecrire(
            'insert into jetons (id, token_hash, user_id, kind, expires_at) values (?, ?, ?, ?, ?)',
            [Base::uid(), self::empreinteJeton($secret), $utilisateurId, $kind, Base::dans($duree)]
        );
        return ['secret' => $secret, 'expire' => Base::dans($duree)];
    }

    /**
     * Consomme un lien.
     *
     * La consommation est définitive : un lien de réinitialisation qui
     * resterait valable après usage traînerait indéfiniment dans une boîte de
     * réception, et resterait une clé du compte.
     *
     * @return array ['utilisateurId' => string, 'kind' => string] ou ['refus' => string]
     */
    public static function consommerJeton(?string $secret, ?string $kind = null): array
    {
        if ($secret === null || $secret === '') {
            return ['refus' => 'absent'];
        }
        $ligne = Base::un('select * from jetons where token_hash = ?', [self::empreinteJeton($secret)]);
        if ($ligne === null) {
            return ['refus' => 'inconnu'];
        }
        if ($kind !== null && $ligne['kind'] !== $kind) {
            return ['refus' => 'inconnu'];
        }
        if ($ligne['used_at'] !== null) {
            return ['refus' => 'deja_utilise'];
        }
        if ($ligne['expires_at'] <= Base::maintenant()) {
            return ['refus' => 'expire'];
        }
        Base::ecrire('update jetons set used_at = ? where id = ?', [Base::maintenant(), $ligne['id']]);
        return ['utilisateurId' => $ligne['user_id'], 'kind' => $ligne['kind']];
    }

    /* --- lecture d'un compte ------------------------------------------------ */

    /**
     * Ligne de `users` vers l'objet que manipule le reste du serveur.
     *
     * L'empreinte du mot de passe n'en fait JAMAIS partie : cet objet est
     * sérialisé en JSON dans les réponses HTTP, et une empreinte qui s'y
     * glisserait partirait vers le navigateur.
     */
    public static function normaliser(?array $ligne): ?array
    {
        if ($ligne === null) {
            return null;
        }
        $empreinte = $ligne['password_hash'] ?? null;
        unset(
            $ligne['password_hash'], $ligne['session_id'], $ligne['session_expire'],
            $ligne['session_vue'], $ligne['token_hash']
        );
        $ligne['failed_attempts'] = (int) ($ligne['failed_attempts'] ?? 0);

        $ligne['public_profile'] = Base::bool($ligne['public_profile'] ?? 0);
        $ligne['must_change_password'] = Base::bool($ligne['must_change_password'] ?? 0);
        $ligne['permissions'] = Base::json($ligne['permissions'] ?? '{}');
        $ligne['a_un_mot_de_passe'] = $empreinte !== null && $empreinte !== '';
        return $ligne;
    }

    public static function parId(?string $id): ?array
    {
        if ($id === null) {
            return null;
        }
        return self::normaliser(Base::un('select * from users where id = ?', [$id]));
    }

    public static function parEmail(?string $email): ?array
    {
        $adresse = trim((string) $email);
        if ($adresse === '') {
            return null;
        }
        return self::normaliser(Base::un('select * from users where email = ? collate nocase', [$adresse]));
    }

    /**
     * Vérifie une paire adresse / mot de passe.
     *
     * Le refus est le même mot dans tous les cas — adresse inconnue, mot de
     * passe faux, compte sans mot de passe. Distinguer renseignerait un
     * attaquant sur les adresses inscrites au registre.
     *
     * @return array ['compte' => array] ou ['refus' => 'identifiants'|'desactive']
     */
    /**
     * Combien de secondes ce compte doit encore attendre, et pourquoi.
     *
     * Rend null quand la porte est ouverte. Le compteur se périme de lui-même :
     * un quart d'heure sans la moindre tentative et l'ardoise est effacée,
     * sans quoi cinq fautes de frappe étalées sur un mois finiraient par
     * bloquer quelqu'un qui n'a rien fait de mal.
     */
    public static function attenteAvantEssai(?array $ligne): ?array
    {
        if ($ligne === null) {
            return null;
        }
        $echecs = (int) ($ligne['failed_attempts'] ?? 0);
        if ($echecs === 0) {
            return null;
        }
        $depuis = strtotime((string) ($ligne['last_failed_at'] ?? '')) ?: 0;
        $ecoule = time() - $depuis;

        if ($echecs >= self::ECHECS_MAX) {
            /* Le blocage court depuis le DERNIER échec : s'acharner le
               prolonge, ce qui est exactement le but. */
            if ($ecoule < self::BLOCAGE) {
                return ['motif' => 'blocage', 'secondes' => self::BLOCAGE - $ecoule];
            }
            return null;
        }

        $delai = self::DELAIS[$echecs] ?? end(self::DELAIS);
        if ($ecoule < $delai) {
            return ['motif' => 'delai', 'secondes' => $delai - $ecoule];
        }
        return null;
    }

    public static function authentifier(?string $email, ?string $motDePasse): array
    {
        $ligne = Base::un('select * from users where email = ? collate nocase', [trim((string) $email)]);

        /* L'attente est vérifiée AVANT de comparer le mot de passe : un compte
           bloqué ne doit pas pouvoir être ouvert par quelqu'un qui finit par
           tomber juste, et la comparaison elle-même coûte du temps de calcul
           qu'on ne va pas offrir à un attaquant. */
        $attente = self::attenteAvantEssai($ligne);
        if ($attente !== null) {
            return ['refus' => 'attendre'] + $attente;
        }

        /* Un quart d'heure sans rien tenter : l'ardoise est effacée. */
        if ($ligne !== null
            && (int) ($ligne['failed_attempts'] ?? 0) > 0
            && time() - (strtotime((string) ($ligne['last_failed_at'] ?? '')) ?: 0) >= self::BLOCAGE) {
            Base::ecrire('update users set failed_attempts = 0 where id = ?', [$ligne['id']]);
            $ligne['failed_attempts'] = 0;
        }

        if (self::$leurre === null) {
            self::$leurre = self::hacherMotDePasse('leurre-pour-egaliser-les-temps-de-reponse');
        }
        $empreinte = $ligne['password_hash'] ?? self::$leurre;
        $correct = self::verifierMotDePasse((string) $motDePasse, $empreinte);

        if ($ligne === null || ($ligne['password_hash'] ?? null) === null || !$correct) {
            /* L'échec est compté sur le COMPTE VISÉ, quand il existe. Compter
               aussi les adresses inconnues remplirait la base de lignes créées
               par l'extérieur, et dirait surtout à l'attaquant, par le temps
               de réponse, quelles adresses existent. Le compte visé, lui,
               apprendra à sa prochaine connexion qu'on s'est acharné sur lui. */
            if ($ligne !== null) {
                Base::ecrire(
                    'update users set failed_attempts = failed_attempts + 1, last_failed_at = ? where id = ?',
                    [Base::maintenant(), $ligne['id']]
                );
            }
            return ['refus' => 'identifiants'];
        }
        if ($ligne['account_status'] === 'DISABLED') {
            return ['refus' => 'desactive'];
        }

        /* Le coût de calcul a pu être relevé depuis la création du compte :
           on en profite pour recalculer l'empreinte, sans rien demander. */
        if (password_needs_rehash($ligne['password_hash'], self::algorithme())) {
            Base::ecrire('update users set password_hash = ? where id = ?', [
                self::hacherMotDePasse((string) $motDePasse),
                $ligne['id'],
            ]);
        }

        return ['compte' => self::normaliser($ligne)];
    }

    /** Écrit un nouveau mot de passe et clôt les autres sessions. */
    public static function definirMotDePasse(string $utilisateurId, string $motDePasse, ?string $sauf = null): void
    {
        Base::ecrire(
            'update users
                set password_hash = ?, must_change_password = 0,
                    activated_at = coalesce(activated_at, ?)
              where id = ?',
            [self::hacherMotDePasse($motDePasse), Base::maintenant(), $utilisateurId]
        );
        /* Changer son mot de passe doit déconnecter les autres appareils :
           c'est précisément ce qu'on fait quand on soupçonne que le compte est
           compromis. */
        self::fermerToutesSessions($utilisateurId, $sauf);
    }
}
