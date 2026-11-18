<?php
/* Sauvegarder et restaurer, sans ligne de commande.
 *
 * L'hébergement n'offre pas d'accès SSH : tout ce qui suit se déclenche par
 * une requête HTTP — un bouton dans l'administration, ou une tâche planifiée
 * du panneau qui appelle une adresse.
 *
 * Quatre étapes, et chacune répond à une façon précise de perdre le registre.
 *
 * 1. À CHAUD. `vacuum into` produit une copie cohérente d'une base vivante,
 *    page par page, sans arrêter le service — et sans journal annexe, ce qui
 *    donne UN fichier et non trois. Un `copy()` du fichier pendant qu'une
 *    écriture est en cours produit au contraire un fichier incohérent, et l'on
 *    s'en aperçoit le jour de la restauration, c'est-à-dire au pire moment.
 *
 * 2. VÉRIFIÉE. Une sauvegarde jamais relue est un espoir, pas une sauvegarde.
 *    Celle-ci est rouverte, contrôlée par `pragma integrity_check`, et l'on
 *    vérifie qu'elle contient les tables du registre. Si quelque chose cloche,
 *    rien n'est laissé en place : un fichier inexploitable rassure à tort.
 *
 * 3. CHIFFRÉE. Elle contient noms, téléphones et empreintes de mots de passe.
 *
 * 4. HORS DU DOSSIER WEB. Une sauvegarde servie par erreur livrerait tout le
 *    registre d'un coup. Elle est déposée à côté de la base, jamais sous la
 *    racine du site.
 */

declare(strict_types=1);

final class Sauvegarde
{
    private const TABLES_ESSENTIELLES = [
        'users', 'certificates', 'certificate_types', 'certification_domains', 'migrations',
    ];

    private static function dossier(): string
    {
        $dossier = Config::DOSSIER_SAUVEGARDES;
        if (!is_dir($dossier) && !@mkdir($dossier, 0750, true) && !is_dir($dossier)) {
            throw new RuntimeException("Le dossier des sauvegardes n'a pas pu être créé : $dossier");
        }
        return $dossier;
    }

    /** Relit une sauvegarde et dit ce qu'elle contient. */
    public static function inventaire(string $chemin): array
    {
        $pdo = new PDO('sqlite:' . $chemin, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        $integrite = $pdo->query('pragma integrity_check')->fetchColumn();
        if ($integrite !== 'ok') {
            throw new RuntimeException("intégrité refusée : $integrite");
        }

        $tables = $pdo->query("select name from sqlite_master where type = 'table'")->fetchAll(PDO::FETCH_COLUMN);
        $manquantes = array_diff(self::TABLES_ESSENTIELLES, $tables);
        if ($manquantes) {
            throw new RuntimeException('tables absentes : ' . implode(', ', $manquantes));
        }

        $compte = fn (string $t): int => in_array($t, $tables, true)
            ? (int) $pdo->query("select count(*) from $t")->fetchColumn()
            : 0;

        $dernier = $pdo->query('select reference, issue_date from certificates order by created_at desc limit 1')->fetch();

        return [
            'comptes'           => $compte('users'),
            'administrateurs'   => (int) $pdo->query("select count(*) from users where role = 'ADMIN'")->fetchColumn(),
            'certificats'       => $compte('certificates'),
            'programmes'        => $compte('certificate_types'),
            'candidatures'      => $compte('candidatures'),
            'dernier_certificat' => $dernier ? $dernier['reference'] . ' (' . $dernier['issue_date'] . ')' : null,
            'migrations'        => $pdo->query('select nom from migrations order by nom')->fetchAll(PDO::FETCH_COLUMN),
        ];
    }

    /**
     * Crée une sauvegarde. Rend le compte rendu, ou lève.
     *
     * @return array{fichier:string,nom:string,taille:int,chiffree:bool,contenu:array}
     */
    public static function creer(): array
    {
        $dossier = self::dossier();
        $horodatage = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d-Hi');
        $brut = $dossier . '/certify-' . $horodatage . '.db';

        /* --- 1. copie à chaud, sans journal annexe --------------------------- */
        if (file_exists($brut)) {
            @unlink($brut);
        }
        Base::pdo()->exec("vacuum into " . Base::pdo()->quote($brut));

        /* --- 2. vérification -------------------------------------------------- */
        try {
            $contenu = self::inventaire($brut);
        } catch (Throwable $e) {
            @unlink($brut);
            throw new RuntimeException(
                'Sauvegarde refusée — ' . $e->getMessage()
                . ". Rien n'a été laissé en place : un fichier inexploitable rassurerait à tort."
            );
        }

        /* --- 3. chiffrement ---------------------------------------------------- */
        $fichier = $brut;
        $chiffree = false;
        if (Config::SAUVEGARDE_CLE !== '') {
            $chiffre = $brut . '.chiffre';
            file_put_contents($chiffre, Chiffrement::chiffrer((string) file_get_contents($brut), Config::SAUVEGARDE_CLE));
            @unlink($brut);
            $fichier = $chiffre;
            $chiffree = true;
        }
        @chmod($fichier, 0640);

        self::elaguer($dossier, Config::SAUVEGARDES_GARDEES);

        /* Témoin daté : c'est lui que lit l'entretien automatique pour savoir
           s'il doit sauvegarder. Le poser ici plutôt que chez l'appelant fait
           qu'une sauvegarde déclenchée à la main — avant une manipulation
           délicate — décale aussi l'automatique, au lieu d'en provoquer une
           seconde dans la foulée. */
        @touch($dossier . '/.derniere-sauvegarde');

        return [
            'fichier'  => $fichier,
            'nom'      => basename($fichier),
            'taille'   => (int) filesize($fichier),
            'chiffree' => $chiffree,
            'contenu'  => $contenu,
        ];
    }

    /** Ne garde que les N sauvegardes les plus récentes. */
    private static function elaguer(string $dossier, int $garder): int
    {
        $fichiers = glob($dossier . '/certify-*') ?: [];
        usort($fichiers, fn ($a, $b) => filemtime($b) <=> filemtime($a));
        $retires = 0;
        foreach (array_slice($fichiers, max(1, $garder)) as $vieux) {
            if (@unlink($vieux)) {
                $retires++;
            }
        }
        return $retires;
    }

    /** Les sauvegardes présentes, la plus récente d'abord. */
    public static function lister(): array
    {
        $fichiers = glob(self::dossier() . '/certify-*') ?: [];
        usort($fichiers, fn ($a, $b) => filemtime($b) <=> filemtime($a));

        return array_map(fn (string $f): array => [
            'nom'      => basename($f),
            'taille'   => (int) filesize($f),
            'date'     => gmdate('Y-m-d\TH:i:s\Z', (int) filemtime($f)),
            'chiffree' => str_ends_with($f, '.chiffre'),
        ], $fichiers);
    }

    /**
     * Restaure une sauvegarde.
     *
     * Trois précautions, qui viennent toutes de la même idée : on remplace le
     * registre officiel de VIZDATA, et une erreur ici ne se rattrape pas.
     *
     *  — sans `$confirme`, on se contente de lire et de rendre l'inventaire ;
     *  — la base en place est mise de côté avant d'être écrasée ;
     *  — les fichiers -wal et -shm de l'ancienne base sont supprimés : les
     *    laisser ferait rejouer par SQLite un journal étranger sur la base
     *    restaurée, et corromprait précisément ce qu'on vient de récupérer.
     */
    public static function restaurer(string $nom, bool $confirme): array
    {
        /* Le nom vient d'une requête : on n'accepte que ce que nous avons
           produit, et jamais un chemin. */
        if (!preg_match('/^certify-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}\.db(\.chiffre)?$/', $nom)) {
            throw new Refus(400, 'Nom de sauvegarde non reconnu.');
        }
        $source = self::dossier() . '/' . $nom;
        if (!is_file($source)) {
            throw new Refus(404, 'Sauvegarde introuvable.');
        }

        $contenu = (string) file_get_contents($source);
        if (Chiffrement::estChiffre($contenu)) {
            if (Config::SAUVEGARDE_CLE === '') {
                throw new Refus(400, 'Cette sauvegarde est chiffrée, et aucune clé n\'est configurée sur ce serveur.');
            }
            try {
                $contenu = Chiffrement::dechiffrer($contenu, Config::SAUVEGARDE_CLE);
            } catch (Throwable $e) {
                throw new Refus(400, $e->getMessage());
            }
        }

        $provisoire = self::dossier() . '/.restauration-' . getmypid() . '.db';
        file_put_contents($provisoire, $contenu);

        try {
            $depuis = self::inventaire($provisoire);
        } catch (Throwable $e) {
            @unlink($provisoire);
            throw new Refus(400, 'Sauvegarde inexploitable — ' . $e->getMessage() . ". La base en place n'a pas été touchée.");
        }

        $cible = Config::CHEMIN_BASE;
        $actuelle = null;
        try {
            $actuelle = self::inventaire($cible);
        } catch (Throwable) {
            /* Base absente ou illisible : on le dira, et la restauration vaut
               mieux que rien. */
        }

        if (!$confirme) {
            @unlink($provisoire);
            return ['applique' => false, 'sauvegarde' => $nom, 'elle_contient' => $depuis, 'elle_remplacerait' => $actuelle];
        }

        /* La base précédente est mise de côté : restaurer la mauvaise
           sauvegarde est une erreur banale, la rendre irréversible serait une
           faute. */
        $misDeCote = null;
        if (is_file($cible)) {
            $misDeCote = self::dossier() . '/avant-restauration-' . gmdate('Y-m-d-His') . '.db';
            @copy($cible, $misDeCote);
        }

        /* La connexion courante tient le fichier : on la referme avant de le
           remplacer, sinon on écrirait sous les pieds de SQLite. */
        Base::fermer();

        copy($provisoire, $cible);
        @unlink($cible . '-wal');
        @unlink($cible . '-shm');
        @unlink($provisoire);
        @chmod($cible, 0640);

        return [
            'applique'       => true,
            'sauvegarde'     => $nom,
            'mise_de_cote'   => $misDeCote === null ? null : basename($misDeCote),
            'elle_contient'  => self::inventaire($cible),
        ];
    }
}
