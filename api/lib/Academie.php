<?php
/* L'académie CITIZEN DATA ANALYST.
 *
 * Second métier dans la même application : des candidatures à une formation,
 * pas des certificats délivrés. Les deux partagent la base — une seconde base
 * serait une seconde chose à sauvegarder, et à perdre.
 *
 * Ce que la page publique peut faire, et rien de plus
 * ---------------------------------------------------
 * Lire la cohorte publiée, et déposer une candidature. Elle ne lit JAMAIS la
 * table : une candidature porte un nom, un numéro de téléphone et une adresse
 * e-mail, et ouvrir la lecture donnerait à n'importe quel visiteur la liste
 * des candidats. Les tarifs d'une cohorte encore en brouillon ne sortent pas
 * non plus.
 *
 * Cette séparation tient au fait qu'aucune route publique ne lit ces tables —
 * ce qui se vérifie en lisant la table des routes d'index.php.
 */

declare(strict_types=1);

final class Academie
{
    private const CHAMPS_CANDIDATURE = ['statut', 'notes', 'cohorte_id'];
    private const CHAMPS_COHORTE = [
        'libelle', 'date_debut', 'date_fin', 'lieu', 'places',
        'tarif_integral', 'tarif_echelonne', 'statut', 'note_publique', 'publiee',
    ];

    /* --- page publique ------------------------------------------------------ */

    /**
     * La cohorte annoncée au public, ou `null`.
     *
     * `null` est un cas normal, pas une panne : tant qu'aucune session n'est
     * publiée, la page affiche le programme et les tarifs de référence sans
     * annoncer de date. C'est préférable à une date inventée qu'il faudrait
     * ensuite démentir.
     *
     * La projection est explicite : les notes internes d'une cohorte n'ont
     * rien à faire sur une page de vente.
     */
    public static function cohortePubliee(): ?array
    {
        $ligne = Base::un(
            "select id, libelle, date_debut, date_fin, lieu, places,
                    tarif_integral, tarif_echelonne, statut, note_publique
               from cohortes
              where publiee = 1 and statut in ('OUVERTE', 'COMPLETE')
              order by date_debut
              limit 1"
        );
        if ($ligne === null) {
            return null;
        }
        foreach (['places', 'tarif_integral', 'tarif_echelonne'] as $entier) {
            if ($ligne[$entier] !== null) {
                $ligne[$entier] = (int) $ligne[$entier];
            }
        }
        return $ligne;
    }

    /** Référence lisible, à citer au téléphone : CDA-2026-0001. */
    public static function prochaineReference(string $annee): string
    {
        $prefixe = 'CDA-' . $annee . '-';
        $n = Base::valeur(
            'select max(cast(substr(reference, ?) as integer)) from candidatures
              where reference like ? || \'%\' and substr(reference, ?) glob \'[0-9]*\'',
            [strlen($prefixe) + 1, $prefixe, strlen($prefixe) + 1]
        );
        return $prefixe . str_pad((string) (((int) $n) + 1), 4, '0', STR_PAD_LEFT);
    }

    /**
     * Enregistre une candidature et rend sa référence.
     *
     * Les deux engagements — disponibilité et consentement au contact — sont
     * exigés ici ET par la base. Le double contrôle n'est pas une redondance :
     * le formulaire peut être contourné par un appel direct, et une
     * candidature sans consentement au contact n'a pas le droit d'exister.
     */
    public static function soumettreCandidature(array $c, string $source = 'page-academie'): string
    {
        foreach (['nom', 'whatsapp', 'email', 'profession', 'niveau', 'formule'] as $champ) {
            if (trim((string) ($c[$champ] ?? '')) === '') {
                throw new Refus(400, "Le champ « $champ » est obligatoire.");
            }
        }
        if (empty($c['disponible']) || empty($c['consent'])) {
            throw new Refus(400, "La disponibilité et l'accord pour être recontacté sont obligatoires.");
        }
        if (!filter_var((string) $c['email'], FILTER_VALIDATE_EMAIL)) {
            throw new Refus(400, "L'adresse e-mail n'est pas valide.");
        }
        if (!in_array($c['niveau'], ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'], true)) {
            throw new Refus(400, "Le niveau indiqué n'est pas reconnu.");
        }
        if (!in_array($c['formule'], ['INTEGRAL', 'ECHELONNE'], true)) {
            throw new Refus(400, "La formule de paiement n'est pas reconnue.");
        }

        return Base::transaction(function () use ($c, $source) {
            $adresse = strtolower(trim((string) $c['email']));

            /* Garde-fou contre l'envoi répété : trois candidatures par adresse
               et par jour suffisent largement à corriger une faute de frappe,
               et empêchent qu'un formulaire public ne serve à remplir la table. */
            $recentes = (int) Base::valeur(
                "select count(*) from candidatures
                  where email = ? collate nocase and created_at > datetime('now', '-1 day')",
                [$adresse]
            );
            if ($recentes >= 3) {
                throw new Refus(429, "Trop de candidatures déposées avec cette adresse aujourd'hui. Écrivez-nous sur WhatsApp.");
            }

            $cohorte = self::cohortePubliee();
            $reference = self::prochaineReference(date('Y'));

            Base::ecrire(
                'insert into candidatures
                   (id, reference, cohorte_id, nom, whatsapp, email, profession, entreprise,
                    niveau, motivation, formule, disponible, consent_contact, source)
                 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)',
                [
                    Base::uid(),
                    $reference,
                    $cohorte['id'] ?? null,
                    trim((string) $c['nom']),
                    trim((string) $c['whatsapp']),
                    $adresse,
                    trim((string) $c['profession']),
                    trim((string) ($c['entreprise'] ?? '')),
                    $c['niveau'],
                    mb_substr((string) ($c['motivation'] ?? ''), 0, 2000),
                    $c['formule'],
                    mb_substr($source, 0, 60),
                ]
            );

            return $reference;
        });
    }

    /* --- administration ------------------------------------------------------ */

    public static function listerCandidatures(): array
    {
        return Base::tous(
            'select id, reference, cohorte_id, nom, whatsapp, email, profession, entreprise,
                    niveau, motivation, formule, statut, notes, source, created_at, updated_at
               from candidatures order by created_at desc'
        );
    }

    public static function listerCohortes(): array
    {
        return array_map(function (array $c): array {
            $c['publiee'] = Base::bool($c['publiee']);
            foreach (['places', 'tarif_integral', 'tarif_echelonne'] as $entier) {
                if ($c[$entier] !== null) {
                    $c[$entier] = (int) $c[$entier];
                }
            }
            return $c;
        }, Base::tous('select * from cohortes order by (date_debut is null), date_debut desc'));
    }

    public static function majCandidature(?array $acteur, string $id, array $champs): array
    {
        $retenus = array_intersect_key($champs, array_flip(self::CHAMPS_CANDIDATURE));
        if (!$retenus) {
            throw new Refus(400, 'Rien à modifier.');
        }
        $colonnes = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($retenus)));
        Base::ecrire("update candidatures set $colonnes where id = ?", [...array_values($retenus), $id]);

        $ligne = Base::un('select * from candidatures where id = ?', [$id]);
        if ($ligne === null) {
            throw new Refus(404, 'Candidature introuvable.');
        }
        Registre::journaliser($acteur, 'CANDIDATURE_UPDATED', [
            'entite' => 'candidature', 'entiteId' => $id, 'valeur' => $ligne['reference'],
        ]);
        return $ligne;
    }

    public static function enregistrerCohorte(?array $acteur, array $champs): array
    {
        $id = $champs['id'] ?? null;
        unset($champs['id']);

        $retenus = array_intersect_key($champs, array_flip(self::CHAMPS_COHORTE));
        $valeurs = [];
        foreach ($retenus as $colonne => $v) {
            $valeurs[] = $colonne === 'publiee' ? Base::entier($v) : ($v === '' ? null : $v);
        }

        if ($id !== null) {
            if (!$retenus) {
                throw new Refus(400, 'Rien à modifier.');
            }
            $colonnes = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($retenus)));
            Base::ecrire("update cohortes set $colonnes where id = ?", [...$valeurs, $id]);
            $action = 'COHORTE_UPDATED';
        } else {
            $id = Base::uid();
            $colonnes = array_keys($retenus);
            $liste = $colonnes ? ', ' . implode(', ', $colonnes) : '';
            $trous = $colonnes ? ', ' . implode(', ', array_fill(0, count($colonnes), '?')) : '';
            Base::ecrire("insert into cohortes (id$liste) values (?$trous)", [$id, ...$valeurs]);
            $action = 'COHORTE_CREATED';
        }

        $ligne = Base::un('select * from cohortes where id = ?', [$id]);
        Registre::journaliser($acteur, $action, [
            'entite' => 'cohorte', 'entiteId' => $id, 'valeur' => $ligne['libelle'] ?? '',
        ]);
        $ligne['publiee'] = Base::bool($ligne['publiee']);
        return $ligne;
    }

    /**
     * Publie une cohorte et dépublie les autres.
     *
     * `cohortePubliee` ne rend qu'une ligne : laisser deux cohortes publiées ne
     * casserait rien, mais la page afficherait la première par date sans que
     * l'administration comprenne pourquoi. On rend l'intention explicite.
     */
    public static function publierCohorte(?array $acteur, string $id): array
    {
        return Base::transaction(function () use ($acteur, $id) {
            if (Base::un('select id from cohortes where id = ?', [$id]) === null) {
                throw new Refus(404, 'Cohorte introuvable.');
            }
            Base::ecrire('update cohortes set publiee = 0 where id <> ?', [$id]);
            Base::ecrire("update cohortes set publiee = 1, statut = 'OUVERTE' where id = ?", [$id]);

            $ligne = Base::un('select * from cohortes where id = ?', [$id]);
            Registre::journaliser($acteur, 'COHORTE_PUBLIEE', [
                'entite' => 'cohorte', 'entiteId' => $id, 'valeur' => $ligne['libelle'],
            ]);
            $ligne['publiee'] = true;
            return $ligne;
        });
    }

    /** Supprime une cohorte. Les candidatures rattachées sont conservées — la
     *  clé étrangère est en SET NULL : on ne perd pas un candidat parce qu'une
     *  session a été annulée. */
    public static function supprimerCohorte(?array $acteur, string $id): bool
    {
        $efface = Base::ecrire('delete from cohortes where id = ?', [$id]) > 0;
        if ($efface) {
            Registre::journaliser($acteur, 'COHORTE_SUPPRIMEE', ['entite' => 'cohorte', 'entiteId' => $id]);
        }
        return $efface;
    }
}
