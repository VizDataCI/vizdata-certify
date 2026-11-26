<?php
/* Validation en deux étapes, par application d'authentification.
 *
 * Le standard, et pourquoi celui-là
 * ---------------------------------
 * TOTP (RFC 6238) : un secret partagé, l'horloge, six chiffres qui changent
 * toutes les trente secondes. C'est ce que lisent Google Authenticator,
 * Microsoft Authenticator, Authy, 1Password, Bitwarden et les autres : aucune
 * application n'est imposée au titulaire, et VIZDATA n'a aucun service tiers à
 * payer ni à faire confiance. Un SMS aurait coûté à chaque connexion, et se
 * détourne par duplication de carte SIM.
 *
 * Où vit le secret
 * ----------------
 * Le secret ne peut pas être haché : le serveur doit le relire pour recalculer
 * le code attendu. Il est donc chiffré en AES-256-GCM, avec une clé qui vit
 * dans un FICHIER à côté de la base, jamais dans la base. Une copie de la base
 * seule (une sauvegarde égarée, un dump) ne permet donc pas de fabriquer des
 * codes.
 *
 * La contrepartie est à connaître : restaurer la base sur une machine qui n'a
 * pas le fichier de clé rend les secrets illisibles. Les titulaires concernés
 * entrent alors avec un code de secours : ceux-là sont hachés, donc toujours
 * valables, ou un administrateur désactive leur second facteur. C'est pour
 * cela que ces deux échappatoires existent.
 */

declare(strict_types=1);

final class DoubleFacteur
{
    /** Longueur du secret : 20 octets, ce que recommande la RFC 4226. */
    private const OCTETS_SECRET = 20;

    /** Pas de temps, en secondes. Trente : la valeur que toutes les applications supposent. */
    private const PAS = 30;

    /** Tolérance d'horloge, en pas. Un pas de part et d'autre : 90 secondes en tout. */
    private const FENETRE = 1;

    private const CHIFFRES = 6;

    /** Codes de secours remis à l'activation. */
    private const NB_CODES_SECOURS = 10;

    /** Durée du défi entre le mot de passe accepté et le code vérifié. */
    private const DUREE_DEFI = 300;

    /** Tentatives de code autorisées sur un même défi. */
    private const ESSAIS_MAX = 6;

    /* --- la clé de chiffrement ---------------------------------------------- */

    /**
     * La clé, lue ou créée à côté de la base.
     *
     * Créée à la volée au premier usage : rien à renseigner dans la
     * configuration, donc rien à oublier de renseigner. Le fichier est en 0600
     * et commence par un point, mais ce n'est pas ce qui le protège : il vit
     * hors du dossier web, comme la base.
     */
    private static function cle(): string
    {
        $chemin = dirname(Config::CHEMIN_BASE) . '/.cle-secrets';

        if (is_file($chemin)) {
            $brut = file_get_contents($chemin);
            if ($brut !== false && strlen(trim($brut)) >= 44) {
                $cle = base64_decode(trim($brut), true);
                if ($cle !== false && strlen($cle) === 32) {
                    return $cle;
                }
            }
            throw new RuntimeException('Le fichier de clé des secrets est illisible.');
        }

        $cle = random_bytes(32);
        if (@file_put_contents($chemin, base64_encode($cle), LOCK_EX) === false) {
            throw new RuntimeException("La clé des secrets n'a pas pu être écrite : vérifiez les droits du dossier de la base.");
        }
        @chmod($chemin, 0600);
        return $cle;
    }

    private static function chiffrer(string $clair): string
    {
        $iv = random_bytes(12);
        $marque = '';
        $chiffre = openssl_encrypt($clair, 'aes-256-gcm', self::cle(), OPENSSL_RAW_DATA, $iv, $marque, '', 16);
        if ($chiffre === false) {
            throw new RuntimeException('Chiffrement du secret impossible.');
        }
        return base64_encode($iv . $marque . $chiffre);
    }

    /** Rend null si le paquet ne se déchiffre pas : la base a pu changer de machine. */
    private static function dechiffrer(?string $paquet): ?string
    {
        if ($paquet === null || $paquet === '') {
            return null;
        }
        $brut = base64_decode($paquet, true);
        if ($brut === false || strlen($brut) < 29) {
            return null;
        }
        $clair = openssl_decrypt(
            substr($brut, 28),
            'aes-256-gcm',
            self::cle(),
            OPENSSL_RAW_DATA,
            substr($brut, 0, 12),
            substr($brut, 12, 16)
        );
        return $clair === false ? null : $clair;
    }

    /* --- base32, TOTP -------------------------------------------------------- */

    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function base32(string $octets): string
    {
        $bits = '';
        for ($i = 0, $n = strlen($octets); $i < $n; $i++) {
            $bits .= str_pad(decbin(ord($octets[$i])), 8, '0', STR_PAD_LEFT);
        }
        $sortie = '';
        foreach (str_split($bits, 5) as $morceau) {
            $sortie .= self::ALPHABET[bindec(str_pad($morceau, 5, '0', STR_PAD_RIGHT))];
        }
        return $sortie;
    }

    private static function debase32(string $texte): string
    {
        $texte = strtoupper(preg_replace('/[^A-Z2-7]/i', '', $texte) ?? '');
        $bits = '';
        for ($i = 0, $n = strlen($texte); $i < $n; $i++) {
            $v = strpos(self::ALPHABET, $texte[$i]);
            if ($v === false) {
                continue;
            }
            $bits .= str_pad(decbin($v), 5, '0', STR_PAD_LEFT);
        }
        $octets = '';
        foreach (str_split($bits, 8) as $morceau) {
            if (strlen($morceau) === 8) {
                $octets .= chr(bindec($morceau));
            }
        }
        return $octets;
    }

    /** Le code attendu pour un pas de temps donné. */
    private static function codePour(string $secretBase32, int $pas): string
    {
        $compteur = pack('J', $pas);
        $hash = hash_hmac('sha1', $compteur, self::debase32($secretBase32), true);
        $decalage = ord($hash[19]) & 0x0f;
        $tronque = (
            ((ord($hash[$decalage]) & 0x7f) << 24) |
            (ord($hash[$decalage + 1]) << 16) |
            (ord($hash[$decalage + 2]) << 8) |
            ord($hash[$decalage + 3])
        ) % (10 ** self::CHIFFRES);
        return str_pad((string) $tronque, self::CHIFFRES, '0', STR_PAD_LEFT);
    }

    /**
     * Le pas de temps auquel ce code correspond, ou null.
     *
     * La comparaison passe par `hash_equals` : comparer deux chaînes avec `===`
     * s'arrête au premier caractère différent, et le temps de réponse laisse
     * alors deviner le code, chiffre par chiffre.
     */
    public static function pasValide(string $secretBase32, string $code, ?int $maintenant = null): ?int
    {
        $code = preg_replace('/\D/', '', $code) ?? '';
        if (strlen($code) !== self::CHIFFRES) {
            return null;
        }
        $pasCourant = intdiv($maintenant ?? time(), self::PAS);
        for ($d = -self::FENETRE; $d <= self::FENETRE; $d++) {
            if (hash_equals(self::codePour($secretBase32, $pasCourant + $d), $code)) {
                return $pasCourant + $d;
            }
        }
        return null;
    }

    /** L'adresse que lit l'application d'authentification, derrière le QR code. */
    public static function uri(string $email, string $secretBase32): string
    {
        $emetteur = rawurlencode('VIZDATA CERTIFY');
        $compte = rawurlencode($email);
        return "otpauth://totp/$emetteur:$compte"
            . "?secret=$secretBase32&issuer=$emetteur&algorithm=SHA1&digits=" . self::CHIFFRES . '&period=' . self::PAS;
    }

    /* --- activation ---------------------------------------------------------- */

    public static function estActif(?array $compte): bool
    {
        return (int) ($compte['totp_actif'] ?? 0) === 1;
    }

    /**
     * Prépare une activation : un secret neuf, pas encore actif.
     *
     * Rappelé autant de fois que nécessaire tant que l'activation n'est pas
     * confirmée : un titulaire qui ferme l'écran avant d'avoir scanné doit
     * pouvoir recommencer, et le secret inachevé n'a aucune valeur.
     */
    public static function preparer(array $compte): array
    {
        if (self::estActif($compte)) {
            throw new Refus(409, 'La validation en deux étapes est déjà active sur ce compte.');
        }
        $secret = self::base32(random_bytes(self::OCTETS_SECRET));
        Base::ecrire(
            'update users set totp_secret = ?, totp_actif = 0, totp_dernier_pas = 0 where id = ?',
            [self::chiffrer($secret), $compte['id']]
        );
        return ['secret' => $secret, 'uri' => self::uri((string) $compte['email'], $secret)];
    }

    /** Confirme l'activation par un premier code, et rend les codes de secours. */
    public static function activer(array $compte, string $code): array
    {
        if (self::estActif($compte)) {
            throw new Refus(409, 'La validation en deux étapes est déjà active sur ce compte.');
        }
        $ligne = Base::un('select totp_secret from users where id = ?', [$compte['id']]);
        $secret = self::dechiffrer($ligne['totp_secret'] ?? null);
        if ($secret === null) {
            throw new Refus(409, "Aucune activation en cours. Recommencez depuis l'écran Sécurité.");
        }
        $pas = self::pasValide($secret, $code);
        if ($pas === null) {
            throw new Refus(400, "Ce code n'est pas valide. Vérifiez l'heure de votre téléphone, puis réessayez.");
        }

        Base::ecrire(
            'update users set totp_actif = 1, totp_active_a = ?, totp_dernier_pas = ? where id = ?',
            [Base::maintenant(), $pas, $compte['id']]
        );
        return ['codes' => self::renouvelerCodesSecours((string) $compte['id'])];
    }

    /** Coupe le second facteur, et avec lui le secret et les codes de secours. */
    public static function desactiver(string $utilisateurId): void
    {
        Base::ecrire(
            'update users set totp_actif = 0, totp_secret = null, totp_active_a = null, totp_dernier_pas = 0 where id = ?',
            [$utilisateurId]
        );
        Base::ecrire('delete from codes_secours where user_id = ?', [$utilisateurId]);
    }

    /* --- codes de secours ----------------------------------------------------- */

    /**
     * Dix codes neufs. Les anciens disparaissent : laisser cohabiter deux
     * séries reviendrait à doubler la surface d'attaque sans que personne ne
     * sache combien de codes circulent.
     *
     * Ils sont rendus UNE fois, en clair, et hachés en base. VIZDATA ne peut
     * pas les retrouver ensuite : c'est ce qui en fait une preuve.
     */
    public static function renouvelerCodesSecours(string $utilisateurId): array
    {
        Base::ecrire('delete from codes_secours where user_id = ?', [$utilisateurId]);
        $codes = [];
        for ($i = 0; $i < self::NB_CODES_SECOURS; $i++) {
            /* Dix chiffres en deux groupes : lisible à voix haute, recopiable
               sans ambiguïté : pas de lettre qui se confonde avec un chiffre. */
            $brut = str_pad((string) random_int(0, 99999), 5, '0', STR_PAD_LEFT)
                . '-' . str_pad((string) random_int(0, 99999), 5, '0', STR_PAD_LEFT);
            $codes[] = $brut;
            Base::ecrire(
                'insert into codes_secours (id, user_id, code_hash) values (?, ?, ?)',
                [Base::uid(), $utilisateurId, Comptes::hacherMotDePasse($brut)]
            );
        }
        return $codes;
    }

    public static function codesSecoursRestants(string $utilisateurId): int
    {
        $ligne = Base::un(
            'select count(*) as n from codes_secours where user_id = ? and utilise_a is null',
            [$utilisateurId]
        );
        return (int) ($ligne['n'] ?? 0);
    }

    /** Consomme un code de secours. Rend false si aucun ne correspond. */
    private static function consommerCodeSecours(string $utilisateurId, string $saisie): bool
    {
        $saisie = trim($saisie);
        if ($saisie === '') {
            return false;
        }
        foreach (Base::tous('select * from codes_secours where user_id = ? and utilise_a is null', [$utilisateurId]) as $ligne) {
            if (Comptes::verifierMotDePasse($saisie, $ligne['code_hash'])) {
                Base::ecrire('update codes_secours set utilise_a = ? where id = ?', [Base::maintenant(), $ligne['id']]);
                return true;
            }
        }
        return false;
    }

    /* --- le défi de connexion -------------------------------------------------- */

    /** Ouvre l'entre-deux : mot de passe accepté, code pas encore vérifié. */
    public static function ouvrirDefi(string $utilisateurId): string
    {
        Base::ecrire('delete from defis_connexion where user_id = ? or expires_at <= ?', [$utilisateurId, Base::maintenant()]);
        $secret = Comptes::nouveauSecret();
        Base::ecrire(
            'insert into defis_connexion (id, token_hash, user_id, expires_at) values (?, ?, ?, ?)',
            [Base::uid(), Comptes::empreinteJeton($secret), $utilisateurId, Base::dans(self::DUREE_DEFI)]
        );
        return $secret;
    }

    /**
     * Vérifie le code d'un défi.
     *
     * Rend ['utilisateurId' => string] en cas de succès, ['refus' => string]
     * sinon. Le compteur d'essais est porté par le défi : six tentatives, puis
     * il faut ressaisir le mot de passe. Un code à six chiffres se devine en
     * un million d'essais ; sans plafond, une machine y arriverait.
     */
    public static function verifierDefi(?string $jeton, string $code): array
    {
        if ($jeton === null || $jeton === '') {
            return ['refus' => 'absent'];
        }
        $defi = Base::un('select * from defis_connexion where token_hash = ?', [Comptes::empreinteJeton($jeton)]);
        if ($defi === null) {
            return ['refus' => 'inconnu'];
        }
        if ($defi['expires_at'] <= Base::maintenant()) {
            Base::ecrire('delete from defis_connexion where id = ?', [$defi['id']]);
            return ['refus' => 'expire'];
        }
        if ((int) $defi['essais'] >= self::ESSAIS_MAX) {
            Base::ecrire('delete from defis_connexion where id = ?', [$defi['id']]);
            return ['refus' => 'trop_essais'];
        }
        Base::ecrire('update defis_connexion set essais = essais + 1 where id = ?', [$defi['id']]);

        $compte = Base::un('select * from users where id = ?', [$defi['user_id']]);
        if ($compte === null) {
            return ['refus' => 'inconnu'];
        }

        $secret = self::dechiffrer($compte['totp_secret'] ?? null);
        if ($secret !== null) {
            $pas = self::pasValide($secret, $code);
            if ($pas !== null) {
                /* Un code déjà utilisé ne vaut plus : sans cette borne, il
                   resterait rejouable pendant toute la fenêtre de tolérance. */
                if ($pas <= (int) $compte['totp_dernier_pas']) {
                    return ['refus' => 'deja_utilise'];
                }
                Base::ecrire('update users set totp_dernier_pas = ? where id = ?', [$pas, $compte['id']]);
                Base::ecrire('delete from defis_connexion where id = ?', [$defi['id']]);
                return ['utilisateurId' => (string) $compte['id'], 'secours' => false];
            }
        }

        if (self::consommerCodeSecours((string) $compte['id'], $code)) {
            Base::ecrire('delete from defis_connexion where id = ?', [$defi['id']]);
            return ['utilisateurId' => (string) $compte['id'], 'secours' => true];
        }

        return ['refus' => 'code'];
    }

    /** Ménage : les défis périmés ne servent plus à rien. */
    public static function menage(): int
    {
        return Base::ecrire('delete from defis_connexion where expires_at <= ?', [Base::maintenant()]);
    }
}
