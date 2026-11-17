<?php
/* Ouverture et entretien de la base SQLite.
 *
 * Pourquoi PHP
 * ------------
 * L'hébergement de VIZDATA est un mutualisé Plesk : PHP 8.4, pas de Node, pas
 * d'accès SSH. Un serveur Node avait été écrit et éprouvé ; il ne peut pas
 * tourner là. Un registre qui fonctionne sur l'hébergement qu'on a vaut mieux
 * qu'un registre parfait sur une machine qu'on n'a pas.
 *
 * Ce qui ne change pas : le schéma. `schema/001_socle.sql` est le MÊME fichier
 * que celui du serveur Node — du SQLite standard, sans rien de propre à un
 * langage. Les deux implémentations partagent donc leur définition de la
 * vérité, ce qui compte plus que le langage au-dessus.
 *
 * Les pragmas ne sont pas des réglages de confort
 * -----------------------------------------------
 * Trois d'entre eux changent la correction et doivent être posés à CHAQUE
 * ouverture — ils ne sont pas stockés dans le fichier :
 *
 *   foreign_keys = ON   SQLite les ignore par défaut. Sans ce pragma, chaque
 *                       « references » du schéma est un commentaire : on
 *                       pourrait délivrer un certificat à un titulaire
 *                       inexistant, et supprimer un titulaire qui en porte.
 *   journal_mode = WAL  les lectures ne bloquent plus les écritures. Une
 *                       vérification publique ne doit pas attendre qu'un
 *                       administrateur ait fini de délivrer.
 *   busy_timeout        PHP-FPM sert plusieurs requêtes en parallèle ; sans
 *                       attente, deux écritures simultanées se soldent par
 *                       « database is locked ».
 */

declare(strict_types=1);

final class Base
{
    private static ?PDO $pdo = null;

    /** Connexion unique pour toute la requête. */
    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $chemin = Config::CHEMIN_BASE;
        $dossier = dirname($chemin);
        if (!is_dir($dossier) && !@mkdir($dossier, 0750, true) && !is_dir($dossier)) {
            throw new RuntimeException("Le dossier de la base n'a pas pu être créé : $dossier");
        }

        $neuve = !file_exists($chemin);

        $pdo = new PDO('sqlite:' . $chemin, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            /* Les requêtes préparées sont émulées par défaut sur certaines
               configurations : on l'interdit, pour que les paramètres soient
               réellement liés et jamais interpolés dans le SQL. */
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);

        $pdo->exec('pragma foreign_keys = on');
        $pdo->exec('pragma journal_mode = wal');
        $pdo->exec('pragma synchronous = normal');
        $pdo->exec('pragma busy_timeout = 5000');

        /* Contrôle plutôt que confiance : un pragma refusé en silence rendrait
           toutes les clés étrangères décoratives, et rien ne le signalerait
           avant qu'une ligne orpheline n'apparaisse. */
        if ((int) $pdo->query('pragma foreign_keys')->fetchColumn() !== 1) {
            throw new RuntimeException(
                "Les clés étrangères n'ont pas pu être activées : base ouverte sans intégrité référentielle."
            );
        }

        if ($neuve) {
            /* La base ne doit jamais être lisible par le serveur web. Elle est
               déjà hors du dossier web ; on resserre aussi les droits, au cas
               où un jour elle ne le serait plus. */
            @chmod($chemin, 0640);
        }

        self::$pdo = $pdo;
        self::migrer();
        return $pdo;
    }

    /**
     * Applique les migrations absentes.
     *
     * Chaque fichier est joué dans une transaction : s'il échoue à mi-parcours,
     * la base reste dans l'état d'avant et n'est pas marquée comme migrée. Une
     * migration à moitié appliquée est la pire des situations — elle ne se
     * rejoue pas, et elle ne fonctionne pas.
     */
    public static function migrer(): array
    {
        $pdo = self::$pdo;
        $pdo->exec(
            "create table if not exists migrations (
               nom        text primary key,
               applique_a text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             )"
        );

        $deja = $pdo->query('select nom from migrations')->fetchAll(PDO::FETCH_COLUMN);

        /* Le schéma n'existe qu'une fois dans le dépôt : server/schema/. Le
           paquet de déploiement le recopie dans api/schema/. On regarde aux
           deux endroits plutôt que d'entretenir deux fichiers qui finiraient
           par diverger. */
        $fichiers = [];
        foreach ([__DIR__ . '/../schema', __DIR__ . '/../../server/schema'] as $dossier) {
            if (is_dir($dossier)) {
                $fichiers = glob($dossier . '/*.sql') ?: [];
                if ($fichiers) {
                    break;
                }
            }
        }
        if (!$fichiers) {
            throw new RuntimeException("Aucun fichier de schéma trouvé : le déploiement est incomplet.");
        }
        sort($fichiers);

        $appliquees = [];
        foreach ($fichiers as $fichier) {
            $nom = basename($fichier);
            if (in_array($nom, $deja, true)) {
                continue;
            }

            $sql = file_get_contents($fichier);
            $pdo->beginTransaction();
            try {
                $pdo->exec($sql);
                $pdo->prepare('insert into migrations (nom) values (?)')->execute([$nom]);
                $pdo->commit();
                $appliquees[] = $nom;
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw new RuntimeException("Migration $nom refusée : " . $e->getMessage(), 0, $e);
            }
        }
        return $appliquees;
    }

    /**
     * Referme la connexion.
     *
     * Nécessaire avant de remplacer le fichier de base — une restauration —,
     * sinon on écrirait sous les pieds de SQLite, qui tient le fichier ouvert
     * et son journal avec.
     */
    public static function fermer(): void
    {
        self::$pdo = null;
    }

    /* --- confort de lecture ---------------------------------------------- */

    /** Première ligne, ou null. */
    public static function un(string $sql, array $params = []): ?array
    {
        $req = self::pdo()->prepare($sql);
        $req->execute($params);
        $ligne = $req->fetch();
        return $ligne === false ? null : $ligne;
    }

    /** Toutes les lignes. */
    public static function tous(string $sql, array $params = []): array
    {
        $req = self::pdo()->prepare($sql);
        $req->execute($params);
        return $req->fetchAll();
    }

    /** Première colonne de la première ligne. */
    public static function valeur(string $sql, array $params = [])
    {
        $req = self::pdo()->prepare($sql);
        $req->execute($params);
        $v = $req->fetchColumn();
        return $v === false ? null : $v;
    }

    /** Exécute et renvoie le nombre de lignes touchées. */
    public static function ecrire(string $sql, array $params = []): int
    {
        $req = self::pdo()->prepare($sql);
        $req->execute($params);
        return $req->rowCount();
    }

    /**
     * Exécute `$travail` dans une transaction, et défait tout en cas d'échec.
     *
     * Indispensable partout où deux écritures n'ont de sens qu'ensemble :
     * créer un certificat et lier ses compétences, créer un titulaire et son
     * invitation. Une moitié d'opération laisse des données qui mentent.
     */
    public static function transaction(callable $travail)
    {
        $pdo = self::pdo();
        /* SQLite n'imbrique pas les transactions : si l'appelant en a déjà
           ouvert une, on se contente de travailler dedans. */
        if ($pdo->inTransaction()) {
            return $travail();
        }
        $pdo->beginTransaction();
        try {
            $resultat = $travail();
            $pdo->commit();
            return $resultat;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /* --- fabriques partagées --------------------------------------------- */

    /** Identifiant : un uuid v4, en texte. Imprévisible et de longueur fixe. */
    public static function uid(): string
    {
        $o = random_bytes(16);
        $o[6] = chr((ord($o[6]) & 0x0f) | 0x40);
        $o[8] = chr((ord($o[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($o), 4));
    }

    /** Horodatage ISO-8601 UTC — le même format que les valeurs par défaut SQL,
     *  et il se trie dans l'ordre chronologique. */
    public static function maintenant(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    }

    /** Horodatage décalé de n secondes — pour les expirations. */
    public static function dans(int $secondes): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('UTC')))
            ->modify(($secondes >= 0 ? '+' : '') . $secondes . ' seconds')
            ->format('Y-m-d\TH:i:s.v\Z');
    }

    /** Date du jour, 'AAAA-MM-JJ'. */
    public static function jour(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d');
    }

    /** JSON stocké en texte vers tableau, sans jamais lever. */
    public static function json(?string $texte, array $defaut = []): array
    {
        if ($texte === null || $texte === '') {
            return $defaut;
        }
        $decode = json_decode($texte, true);
        return is_array($decode) ? $decode : $defaut;
    }

    /** Booléen SQLite (0/1) vers booléen PHP. */
    public static function bool($v): bool
    {
        return $v === 1 || $v === '1' || $v === true;
    }

    /** Booléen PHP vers entier SQLite. */
    public static function entier($v): int
    {
        return $v ? 1 : 0;
    }
}
