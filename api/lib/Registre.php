<?php
/* Les opérations du registre.
 *
 * Tout ce que l'application demande à la base : la vérification publique,
 * l'espace du titulaire, les lectures et les écritures de l'administration.
 * Le routeur au-dessus ne fait que traduire une requête en appel de méthode,
 * et un résultat en JSON.
 *
 * Deux règles tenues ici, et nulle part ailleurs
 * ----------------------------------------------
 * 1. LA NUMÉROTATION EST ATOMIQUE. `prochaineReference` lit le dernier numéro
 *    et écrit le suivant dans la même transaction que l'insertion. Deux
 *    administrateurs qui délivrent au même instant ne peuvent pas obtenir la
 *    même référence.
 * 2. LA PROJECTION PUBLIQUE EST UNIQUE. Elle passe par la vue
 *    `v_certificats_publics`, qui ne contient ni adresse e-mail, ni score, ni
 *    date d'expiration. Une colonne privée ne peut apparaître sur la page de
 *    vérification que si quelqu'un l'ajoute à la vue — ce qui se voit en
 *    relecture.
 */

declare(strict_types=1);

final class Registre
{
    /* --- règles métier ----------------------------------------------------- */

    /**
     * Statut effectif : l'expiration est calculée à la date, jamais stockée.
     *
     * La même règle que `effectiveStatus()` côté interface. Les certificats
     * délivrés depuis novembre 2026 n'ont pas d'expiration ; ceux d'avant,
     * s'il en venait par une reprise de données, continuent d'être traités.
     */
    public static function statutEffectif(array $c): string
    {
        $statut = $c['status'] ?? 'ACTIVE';
        if ($statut === 'REVOKED' || $statut === 'CANCELLED') {
            return $statut;
        }
        $expiration = $c['expiry_date'] ?? null;
        if ($expiration !== null && $expiration !== '' && $expiration < Base::jour()) {
            return 'EXPIRED';
        }
        return 'ACTIVE';
    }

    /** Jeton public : il voyage dans le QR code imprimé, donc il doit être
     *  imprévisible. L'alphabet exclut les caractères qu'on confond à la
     *  lecture (l, o, 0, 1) pour qu'un jeton reste recopiable à la main. */
    public static function nouveauJetonPublic(): string
    {
        $alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
        $octets = random_bytes(14);
        $sortie = '';
        for ($i = 0; $i < 14; $i++) {
            $sortie .= $alphabet[ord($octets[$i]) % strlen($alphabet)];
        }
        return $sortie;
    }

    /** Identifiant public lisible, dérivé du nom. */
    public static function identifiantLibre(string $prenom, string $nom, string $secours): string
    {
        $base = self::slug("$prenom $nom");
        if ($base === '') {
            $base = self::slug(explode('@', $secours)[0]);
        }
        if ($base === '') {
            $base = 'titulaire';
        }
        $candidat = $base;
        for ($essai = 2; $essai < 200; $essai++) {
            if (Base::un('select id from users where username = ? collate nocase', [$candidat]) === null) {
                return $candidat;
            }
            $candidat = $base . '-' . $essai;
        }
        return $base . '-' . substr(Base::uid(), 0, 6);
    }

    private static function slug(string $texte): string
    {
        $sans = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $texte);
        $sans = $sans === false ? $texte : $sans;
        $sans = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $sans) ?? '');
        return trim($sans, '-');
    }

    /* --- chemin public ------------------------------------------------------ */

    /** Compétences d'un certificat, par leur nom. */
    public static function competencesDe(string $certificatId): array
    {
        return array_column(
            Base::tous(
                'select s.name from certificate_skills cs join skills s on s.id = cs.skill_id
                  where cs.certificate_id = ? order by s.name',
                [$certificatId]
            ),
            'name'
        );
    }

    /** Ce qui sort vraiment vers le visiteur. */
    public static function projectionPublique(array $ligne): array
    {
        $statut = self::statutEffectif($ligne);
        return [
            'reference'     => $ligne['reference'],
            'holder_name'   => $ligne['holder_name'],
            'certification' => $ligne['certification'],
            'domain'        => $ligne['domain'],
            'program_code'  => $ligne['program_code'],
            'issuer'        => $ligne['issuer'],
            'issue_date'    => $ligne['issue_date'],
            'status'        => $statut,
            /* Le motif n'a de sens que pour un certificat révoqué, et n'a rien
               à faire dans la réponse autrement. */
            'revoke_reason' => $statut === 'REVOKED' ? $ligne['revoke_reason'] : null,
            'public_token'  => $ligne['public_token'],
            'description'   => $ligne['description'],
            'duration'      => $ligne['duration'] === null ? null : (int) $ligne['duration'],
            'trainer'       => $ligne['trainer'],
            'signatory'     => $ligne['signatory'],
            'skills'        => self::competencesDe($ligne['id']),
        ];
    }

    /**
     * Vérification par jeton public. La consultation est enregistrée.
     *
     * Un jeton inconnu rend `null` sans rien dire de plus : distinguer
     * « mal formé » de « inexistant » aiderait à énumérer le registre.
     */
    public static function verifierParJeton(string $jeton, string $source = 'qr', array $trace = []): ?array
    {
        $ligne = Base::un('select * from v_certificats_publics where public_token = ?', [$jeton]);
        if ($ligne === null) {
            return null;
        }

        Base::ecrire(
            'insert into verifications (id, certificate_id, source, country, user_agent, ip_hash) values (?, ?, ?, ?, ?, ?)',
            [
                Base::uid(),
                $ligne['id'],
                in_array($source, ['qr', 'reference', 'lien'], true) ? $source : 'qr',
                $trace['pays'] ?? null,
                $trace['agent'] ?? null,
                $trace['empreinteIp'] ?? null,
            ]
        );

        return self::projectionPublique($ligne);
    }

    public static function verifierParReference(string $reference, array $trace = []): ?array
    {
        $ligne = Base::un(
            'select public_token from v_certificats_publics where reference = ? collate nocase',
            [trim($reference)]
        );
        if ($ligne === null) {
            return null;
        }
        return self::verifierParJeton($ligne['public_token'], 'reference', $trace);
    }

    /**
     * Certifications en vigueur d'un titulaire au profil public.
     *
     * Un profil fermé, un compte désactivé et un identifiant inconnu rendent
     * tous trois une liste vide : l'absence de réponse ne doit pas renseigner
     * sur l'existence d'un compte.
     */
    public static function profilPublic(string $identifiant): array
    {
        $lignes = Base::tous(
            'select v.* from v_certificats_publics v
               join users u on u.username = v.holder_username
              where u.username = ? collate nocase
                and u.public_profile = 1
                and u.account_status = \'ACTIVE\'
              order by v.issue_date desc',
            [$identifiant]
        );

        $sortie = [];
        foreach ($lignes as $l) {
            if (self::statutEffectif($l) !== 'ACTIVE') {
                continue;
            }
            $sortie[] = [
                'holder_name'   => $l['holder_name'],
                'certification' => $l['certification'],
                'domain'        => $l['domain'],
                'reference'     => $l['reference'],
                'issue_date'    => $l['issue_date'],
                'public_token'  => $l['public_token'],
            ];
        }
        return $sortie;
    }

    public static function enregistrerPartage(string $jeton, ?string $plateforme): bool
    {
        if (!in_array($plateforme, ['linkedin', 'whatsapp', 'email', 'copy_link'], true)) {
            return false;
        }
        $ligne = Base::un('select id from certificates where public_token = ?', [$jeton]);
        if ($ligne === null) {
            return false;
        }
        Base::ecrire('insert into shares (id, certificate_id, platform) values (?, ?, ?)', [
            Base::uid(), $ligne['id'], $plateforme,
        ]);
        return true;
    }

    /* --- espace du titulaire ------------------------------------------------ */

    public static function certificatsDe(string $utilisateurId): array
    {
        $lignes = Base::tous(
            'select * from v_certificats_publics
              where id in (select id from certificates where user_id = ?)
              order by issue_date desc',
            [$utilisateurId]
        );
        return array_map(function (array $l): array {
            $c = self::projectionPublique($l);
            $c['id'] = $l['id'];
            $c['created_at'] = $l['created_at'];
            return $c;
        }, $lignes);
    }

    /* --- registre d'administration ------------------------------------------ */

    /**
     * Tout ce dont les écrans d'administration ont besoin, en une réponse.
     *
     * Un appel plutôt que douze : les écrans croisent sans cesse certificats,
     * titulaires, programmes et domaines, et un registre d'organisme de
     * formation tient largement en mémoire.
     */
    public static function complet(bool $pourAdmin = false): array
    {
        $certificats = Base::tous('select * from certificates order by created_at desc');

        /* Les compétences sont rapatriées à plat puis regroupées : une requête
           par certificat ferait autant d'allers-retours que de lignes. */
        $parCertificat = [];
        foreach (Base::tous('select certificate_id, skill_id from certificate_skills') as $l) {
            $parCertificat[$l['certificate_id']][] = $l['skill_id'];
        }
        foreach ($certificats as &$c) {
            $c['skills'] = $parCertificat[$c['id']] ?? [];
            $c['duration'] = $c['duration'] === null ? null : (int) $c['duration'];
            $c['score'] = $c['score'] === null ? null : (int) $c['score'];
        }
        unset($c);

        $programmes = array_map(function (array $t): array {
            /* La forme imbriquée que l'interface lit déjà. */
            $t['certification_domains'] = $t['domaine_id'] === null ? null : [
                'id' => $t['domaine_id'], 'code' => $t['domaine_code'], 'name' => $t['domaine_nom'],
            ];
            unset($t['domaine_id'], $t['domaine_code'], $t['domaine_nom']);
            $t['default_duration'] = (int) $t['default_duration'];
            $t['sort_order'] = (int) $t['sort_order'];
            return $t;
        }, Base::tous(
            'select t.*, d.id as domaine_id, d.code as domaine_code, d.name as domaine_nom
               from certificate_types t
               left join certification_domains d on d.id = t.domain_id
              order by t.sort_order, t.name'
        ));

        $comptes = array_map(function (array $u): array {
            $u['public_profile'] = Base::bool($u['public_profile']);
            $u['must_change_password'] = Base::bool($u['must_change_password']);
            $u['permissions'] = Base::json($u['permissions']);
            return $u;
        }, Base::tous(
            'select id, email, first_name, last_name, phone, username, linkedin_url, public_profile,
                    role, account_status, must_change_password, permissions, invited_at, activated_at,
                    last_login_at, created_at
               from users order by created_at desc'
        ));

        $journal = array_map(function (array $l): array {
            $l['actor'] = $l['actor_name'];
            $l['metadata'] = Base::json($l['metadata'])['valeur'] ?? '';
            unset($l['actor_name']);
            return $l;
        }, Base::tous(
            'select id, actor_id, actor_name, action, entity_type, entity_id, metadata, created_at
               from audit_logs order by created_at desc limit 200'
        ));

        return [
            'users'         => $comptes,
            'domains'       => Base::tous('select * from certification_domains order by sort_order, name'),
            'types'         => $programmes,
            'templates'     => $pourAdmin ? Base::tous('select * from certificate_templates order by name') : [],
            'skills'        => Base::tous('select * from skills order by name'),
            'certificates'  => $certificats,
            'verifications' => Base::tous('select * from verifications order by verified_at desc limit 500'),
            'shares'        => Base::tous('select * from shares'),
            'audit_logs'    => $journal,
            'notifications' => Base::tous('select * from notifications order by created_at desc limit 200'),
        ];
    }

    /* --- journal ------------------------------------------------------------ */

    /**
     * Inscrit une action au journal.
     *
     * Le nom de l'auteur est figé au moment de l'acte, en plus de son
     * identifiant : un compte supprimé laisserait sinon des lignes sans auteur
     * lisible, et un journal qui perd le nom de qui a agi perd sa valeur de
     * preuve.
     */
    public static function journaliser(?array $acteur, string $action, array $options = []): void
    {
        Base::ecrire(
            'insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
             values (?, ?, ?, ?, ?, ?)',
            [
                $acteur['id'] ?? null,
                $acteur === null ? 'Public' : trim(($acteur['first_name'] ?? '') . ' ' . ($acteur['last_name'] ?? '')),
                $action,
                $options['entite'] ?? 'certificate',
                $options['entiteId'] ?? null,
                json_encode(['valeur' => $options['valeur'] ?? ''], JSON_UNESCAPED_UNICODE),
            ]
        );
    }

    /* --- certificats -------------------------------------------------------- */

    /**
     * Prochaine référence pour un programme et une année.
     *
     * Appelée DANS la transaction d'insertion : lue et consommée sans fenêtre
     * où un second administrateur pourrait lire le même numéro.
     */
    public static function prochaineReference(string $code, string $annee): string
    {
        $prefixe = 'VIZ-' . $annee . '-' . strtoupper($code) . '-';
        $n = Base::valeur(
            'select max(cast(substr(reference, ?) as integer)) from certificates
              where reference like ? || \'%\' and substr(reference, ?) glob \'[0-9]*\'',
            [strlen($prefixe) + 1, $prefixe, strlen($prefixe) + 1]
        );
        return $prefixe . str_pad((string) (((int) $n) + 1), 6, '0', STR_PAD_LEFT);
    }

    public static function remplacerCompetences(string $certificatId, ?array $skills): void
    {
        if ($skills === null) {
            return;
        }
        Base::ecrire('delete from certificate_skills where certificate_id = ?', [$certificatId]);
        foreach ($skills as $skill) {
            /* Une compétence inconnue violerait la clé étrangère, et l'erreur
               remonterait sous la forme illisible « Les données envoyées ne
               sont pas valides. ». On la nomme. */
            if (Base::un('select id from skills where id = ?', [$skill]) === null) {
                throw new Refus(400, 'Compétence inconnue du référentiel : ' . $skill);
            }
            Base::ecrire(
                'insert or ignore into certificate_skills (certificate_id, skill_id) values (?, ?)',
                [$certificatId, $skill]
            );
        }
    }

    /** Délivre un certificat. */
    public static function creerCertificat(array $acteur, array $champs): array
    {
        return Base::transaction(function () use ($acteur, $champs) {
            $programme = Base::un('select * from certificate_types where id = ?', [$champs['certificate_type_id'] ?? '']);
            if ($programme === null) {
                throw new Refus(400, 'Programme de certification inconnu.');
            }
            if (Base::un('select id from users where id = ?', [$champs['user_id'] ?? '']) === null) {
                throw new Refus(400, 'Titulaire inconnu.');
            }

            $date = $champs['issue_date'] ?? Base::jour();
            $reference = self::prochaineReference($programme['code'], substr($date, 0, 4));
            $id = Base::uid();

            Base::ecrire(
                'insert into certificates
                   (id, reference, public_token, user_id, certificate_type_id, issued_by, template_id,
                    issue_date, status, duration, trainer, signatory)
                 values (?, ?, ?, ?, ?, ?, ?, ?, \'ACTIVE\', ?, ?, ?)',
                [
                    $id,
                    $reference,
                    self::nouveauJetonPublic(),
                    $champs['user_id'],
                    $champs['certificate_type_id'],
                    $acteur['id'] ?? null,
                    $programme['template_id'],
                    $date,
                    (int) ($champs['duration'] ?? 0) ?: (int) $programme['default_duration'],
                    $champs['trainer'] ?? '',
                    $champs['signatory'] ?? '',
                ]
            );

            self::remplacerCompetences($id, $champs['skills'] ?? []);
            self::journaliser($acteur, 'CERTIFICATE_CREATED', ['entiteId' => $id, 'valeur' => $reference]);

            return Base::un('select * from certificates where id = ?', [$id]);
        });
    }

    private const CHAMPS_CERTIFICAT = ['certificate_type_id', 'issue_date', 'duration', 'trainer', 'signatory'];

    public static function majCertificat(array $acteur, string $id, array $champs, ?array $skills): array
    {
        return Base::transaction(function () use ($acteur, $id, $champs, $skills) {
            $existant = Base::un('select * from certificates where id = ?', [$id]);
            if ($existant === null) {
                throw new Refus(404, 'Certificat introuvable.');
            }

            $retenus = array_intersect_key($champs, array_flip(self::CHAMPS_CERTIFICAT));
            if ($retenus) {
                $colonnes = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($retenus)));
                Base::ecrire("update certificates set $colonnes where id = ?", [...array_values($retenus), $id]);
            }
            self::remplacerCompetences($id, $skills);

            self::journaliser($acteur, 'CERTIFICATE_UPDATED', ['entiteId' => $id, 'valeur' => $existant['reference']]);
            return Base::un('select * from certificates where id = ?', [$id]);
        });
    }

    /** Révoque ou annule. Le motif est exigé par la base pour une révocation. */
    public static function changerStatutCertificat(array $acteur, string $id, string $statut, ?string $motif): array
    {
        return Base::transaction(function () use ($acteur, $id, $statut, $motif) {
            $existant = Base::un('select * from certificates where id = ?', [$id]);
            if ($existant === null) {
                throw new Refus(404, 'Certificat introuvable.');
            }
            if (!in_array($statut, ['ACTIVE', 'REVOKED', 'CANCELLED'], true)) {
                throw new Refus(400, 'Statut inconnu.');
            }

            Base::ecrire('update certificates set status = ?, revoke_reason = ? where id = ?', [
                $statut, $statut === 'ACTIVE' ? '' : (string) $motif, $id,
            ]);

            $action = $statut === 'REVOKED' ? 'CERTIFICATE_REVOKED'
                : ($statut === 'CANCELLED' ? 'CERTIFICATE_CANCELLED' : 'CERTIFICATE_RESTORED');
            self::journaliser($acteur, $action, ['entiteId' => $id, 'valeur' => $existant['reference']]);

            return Base::un('select * from certificates where id = ?', [$id]);
        });
    }

    /* --- catalogue ---------------------------------------------------------- */

    private const CHAMPS_DOMAINE = ['code', 'name', 'description', 'status', 'sort_order'];
    private const CHAMPS_PROGRAMME = [
        'domain_id', 'template_id', 'code', 'name', 'description', 'default_duration', 'sort_order', 'status',
    ];

    public static function creerDomaine(array $acteur, array $champs): array
    {
        $id = Base::uid();
        Base::ecrire(
            'insert into certification_domains (id, code, name, description, status, sort_order) values (?, ?, ?, ?, ?, ?)',
            [
                $id,
                strtoupper(trim((string) ($champs['code'] ?? ''))),
                (string) ($champs['name'] ?? ''),
                (string) ($champs['description'] ?? ''),
                $champs['status'] ?? 'ACTIVE',
                (int) ($champs['sort_order'] ?? 100) ?: 100,
            ]
        );
        self::journaliser($acteur, 'DOMAIN_CREATED', ['entite' => 'domain', 'entiteId' => $id, 'valeur' => $champs['code'] ?? '']);
        return Base::un('select * from certification_domains where id = ?', [$id]);
    }

    public static function majDomaine(array $acteur, string $id, array $champs): array
    {
        $retenus = array_intersect_key($champs, array_flip(self::CHAMPS_DOMAINE));
        if (!$retenus) {
            throw new Refus(400, 'Rien à modifier.');
        }
        if (isset($retenus['code'])) {
            $retenus['code'] = strtoupper(trim((string) $retenus['code']));
        }
        $colonnes = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($retenus)));
        Base::ecrire("update certification_domains set $colonnes where id = ?", [...array_values($retenus), $id]);
        self::journaliser($acteur, 'DOMAIN_UPDATED', ['entite' => 'domain', 'entiteId' => $id, 'valeur' => $champs['code'] ?? '']);
        return Base::un('select * from certification_domains where id = ?', [$id]);
    }

    public static function creerProgramme(array $acteur, array $champs): array
    {
        $id = Base::uid();
        Base::ecrire(
            'insert into certificate_types
               (id, domain_id, template_id, code, name, description, default_duration, sort_order, status)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $id,
                $champs['domain_id'] ?? null,
                $champs['template_id'] ?? null,
                strtoupper(trim((string) ($champs['code'] ?? ''))),
                (string) ($champs['name'] ?? ''),
                (string) ($champs['description'] ?? ''),
                (int) ($champs['default_duration'] ?? 20) ?: 20,
                (int) ($champs['sort_order'] ?? 100) ?: 100,
                $champs['status'] ?? 'ACTIVE',
            ]
        );
        self::journaliser($acteur, 'PROGRAM_CREATED', ['entite' => 'program', 'entiteId' => $id, 'valeur' => $champs['code'] ?? '']);
        return Base::un('select * from certificate_types where id = ?', [$id]);
    }

    public static function majProgramme(array $acteur, string $id, array $champs): array
    {
        $retenus = array_intersect_key($champs, array_flip(self::CHAMPS_PROGRAMME));
        if (!$retenus) {
            throw new Refus(400, 'Rien à modifier.');
        }
        if (isset($retenus['code'])) {
            $retenus['code'] = strtoupper(trim((string) $retenus['code']));
        }
        $colonnes = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($retenus)));
        Base::ecrire("update certificate_types set $colonnes where id = ?", [...array_values($retenus), $id]);
        self::journaliser($acteur, 'PROGRAM_UPDATED', ['entite' => 'program', 'entiteId' => $id, 'valeur' => $champs['code'] ?? '']);
        return Base::un('select * from certificate_types where id = ?', [$id]);
    }

    /* --- compétences --------------------------------------------------------- *
     *
     * Le référentiel des compétences est propre à VIZDATA : rien n'y entre
     * automatiquement. Il alimente les cases à cocher de l'attribution, et
     * c'est la seule source possible — un certificat ne peut porter qu'un
     * acquis qui existe ici.
     *
     * Aucune suppression. Une compétence effacée disparaîtrait des certificats
     * déjà délivrés (la clé étrangère est en cascade), et la page publique
     * d'un titulaire maigrirait sans que personne ne l'ait décidé. On renomme,
     * on ne retire pas.
     */

    public static function creerCompetence(array $acteur, array $champs): array
    {
        $nom = trim((string) ($champs['name'] ?? ''));
        if ($nom === '') {
            throw new Refus(400, 'Le nom de la compétence est obligatoire.');
        }

        /* Le nom est unique sans égard à la casse : « Power Query » saisi deux
           fois donnerait deux cases à cocher identiques. On rend l'existante. */
        $deja = Base::un('select * from skills where name = ? collate nocase', [$nom]);
        if ($deja !== null) {
            return $deja;
        }

        $id = Base::uid();
        Base::ecrire(
            'insert into skills (id, name, description) values (?, ?, ?)',
            [$id, $nom, (string) ($champs['description'] ?? '')]
        );
        self::journaliser($acteur, 'SKILL_CREATED', ['entite' => 'skill', 'entiteId' => $id, 'valeur' => $nom]);
        return Base::un('select * from skills where id = ?', [$id]);
    }

    public static function majCompetence(array $acteur, string $id, array $champs): array
    {
        if (Base::un('select id from skills where id = ?', [$id]) === null) {
            throw new Refus(404, 'Compétence introuvable.');
        }
        $nom = trim((string) ($champs['name'] ?? ''));
        if ($nom === '') {
            throw new Refus(400, 'Le nom de la compétence est obligatoire.');
        }
        Base::ecrire(
            'update skills set name = ?, description = ? where id = ?',
            [$nom, (string) ($champs['description'] ?? ''), $id]
        );
        self::journaliser($acteur, 'SKILL_UPDATED', ['entite' => 'skill', 'entiteId' => $id, 'valeur' => $nom]);
        return Base::un('select * from skills where id = ?', [$id]);
    }

    /* --- comptes ------------------------------------------------------------ */

    /**
     * Crée un titulaire, ou retrouve celui qui porte déjà cette adresse.
     *
     * Le doublon n'est pas une erreur : c'est le cas courant quand on attribue
     * une seconde certification à quelqu'un. Créer un second compte lui
     * donnerait un second espace personnel, vide, et ses certificats seraient
     * répartis entre les deux.
     */
    public static function creerTitulaire(?array $acteur, array $champs): array
    {
        $adresse = strtolower(trim((string) ($champs['email'] ?? '')));

        $existant = Base::un('select * from users where email = ? collate nocase', [$adresse]);
        if ($existant !== null) {
            return ['titulaire' => Comptes::normaliser($existant), 'existe' => true];
        }

        return Base::transaction(function () use ($acteur, $champs, $adresse) {
            $id = Base::uid();
            $prenom = trim((string) ($champs['first_name'] ?? ''));
            $nom = trim((string) ($champs['last_name'] ?? ''));

            Base::ecrire(
                'insert into users (id, email, first_name, last_name, phone, username, role, account_status,
                                    must_change_password, invited_at, created_by)
                 values (?, ?, ?, ?, ?, ?, ?, \'ACTIVE\', 1, ?, ?)',
                [
                    $id, $adresse, $prenom, $nom,
                    $champs['phone'] ?? null,
                    self::identifiantLibre($prenom, $nom, $adresse),
                    $champs['role'] ?? 'CERTIFIED',
                    Base::maintenant(),
                    $acteur['id'] ?? null,
                ]
            );

            self::journaliser($acteur, 'HOLDER_CREATED', ['entite' => 'user', 'entiteId' => $id, 'valeur' => $adresse]);
            return [
                'titulaire' => Comptes::normaliser(Base::un('select * from users where id = ?', [$id])),
                'existe' => false,
            ];
        });
    }

    private const CHAMPS_COMPTE = [
        'first_name', 'last_name', 'phone', 'linkedin_url', 'public_profile', 'avatar_url',
        'role', 'permissions', 'account_status', 'email',
    ];

    /** Écrit les champs déjà autorisés par `Autorisations::exigerEcritureCompte`. */
    public static function majCompte(array $acteur, string $id, array $champs): array
    {
        $retenus = array_intersect_key($champs, array_flip(self::CHAMPS_COMPTE));
        if (!$retenus) {
            throw new Refus(400, 'Rien à modifier.');
        }

        $valeurs = [];
        foreach ($retenus as $colonne => $v) {
            $valeurs[] = match ($colonne) {
                'public_profile' => Base::entier($v),
                'permissions'    => json_encode($v ?: new stdClass(), JSON_UNESCAPED_UNICODE),
                'email'          => strtolower(trim((string) $v)),
                default          => $v,
            };
        }

        $colonnes = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($retenus)));
        Base::ecrire("update users set $colonnes where id = ?", [...$valeurs, $id]);

        $noms = array_keys($retenus);
        $action = (array_intersect($noms, ['role', 'permissions'])) ? 'ROLE_CHANGED'
            : (in_array('account_status', $noms, true)
                ? (($champs['account_status'] ?? '') === 'DISABLED' ? 'ACCOUNT_DISABLED' : 'ACCOUNT_ENABLED')
                : (in_array('email', $noms, true) ? 'EMAIL_CHANGED' : 'HOLDER_UPDATED'));

        $ligne = Base::un('select * from users where id = ?', [$id]);
        self::journaliser($acteur, $action, ['entite' => 'user', 'entiteId' => $id, 'valeur' => $ligne['email']]);
        return Comptes::normaliser($ligne);
    }

    /* --- notifications ------------------------------------------------------ */

    public static function tracerNotification(array $champs): string
    {
        $id = Base::uid();
        Base::ecrire(
            'insert into notifications (id, user_id, recipient, kind, subject, payload, status, error, sent_at)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $id,
                $champs['user_id'] ?? null,
                $champs['recipient'] ?? '',
                $champs['kind'] ?? '',
                $champs['subject'] ?? '',
                json_encode($champs['payload'] ?? new stdClass(), JSON_UNESCAPED_UNICODE),
                $champs['status'] ?? 'PENDING',
                $champs['error'] ?? null,
                ($champs['status'] ?? '') === 'SENT' ? Base::maintenant() : null,
            ]
        );
        return $id;
    }
}
