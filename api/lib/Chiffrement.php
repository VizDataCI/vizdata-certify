<?php
/* Chiffrement des sauvegardes.
 *
 * Pourquoi chiffrer
 * -----------------
 * Une sauvegarde qui reste sur le serveur ne protège de rien : ni d'une panne
 * de disque, ni de la perte de la machine. Elle doit donc en partir. Or le
 * fichier contient tout le registre : noms, adresses, numéros de téléphone, et
 * les empreintes des mots de passe. Le laisser voyager en clair reviendrait à
 * régler un problème de disponibilité en en créant un de confidentialité.
 *
 * Les choix, et leurs raisons
 * ---------------------------
 * — AES-256-GCM. Il chiffre ET authentifie : une sauvegarde modifiée d'un seul
 *   octet est rejetée au déchiffrement, au lieu de rendre des données fausses.
 *   Pour une pièce probante, c'est la propriété qui compte le plus.
 * — La clé est dérivée du mot de passe par PBKDF2-SHA512, avec un sel tiré au
 *   hasard POUR CHAQUE sauvegarde. Un mot de passe humain a trop peu
 *   d'entropie pour servir de clé directement.
 * — PBKDF2 plutôt que scrypt — qui était retenu du temps du serveur Node —
 *   parce qu'il est livré avec PHP partout, sans extension. Changer de
 *   fonction de dérivation impose de changer le format : d'où le « 2 » dans
 *   l'en-tête. Une sauvegarde au format 1 reste reconnaissable, et le message
 *   d'erreur le dit plutôt que de laisser chercher.
 * — Tous les paramètres voyagent dans l'en-tête. Une sauvegarde doit rester
 *   lisible dans cinq ans, par quelqu'un qui n'aura pas ce dépôt sous les
 *   yeux : elle se décrit elle-même.
 *
 * Format du fichier
 * -----------------
 *   "VIZDATA-SAUVEGARDE-2\n"   21 octets, repérable par un humain
 *   itérations                 4 octets, grand-boutiste
 *   sel                        16 octets
 *   iv                         12 octets
 *   marque d'authenticité      16 octets
 *   données chiffrées          le reste
 */

declare(strict_types=1);

final class Chiffrement
{
    private const MAGIE = "VIZDATA-SAUVEGARDE-2\n";
    private const MAGIE_V1 = "VIZDATA-SAUVEGARDE-1\n";
    private const ITERATIONS = 600000;   // recommandation OWASP pour PBKDF2-SHA512
    private const TAILLE_SEL = 16;
    private const TAILLE_IV = 12;
    private const TAILLE_MARQUE = 16;

    private static function deriver(string $motDePasse, string $sel, int $iterations): string
    {
        return hash_pbkdf2('sha512', $motDePasse, $sel, $iterations, 32, true);
    }

    public static function chiffrer(string $contenu, string $motDePasse): string
    {
        if ($motDePasse === '') {
            throw new RuntimeException('Aucune clé de chiffrement fournie.');
        }

        $sel = random_bytes(self::TAILLE_SEL);
        $iv = random_bytes(self::TAILLE_IV);
        $cle = self::deriver($motDePasse, $sel, self::ITERATIONS);

        $marque = '';
        $donnees = openssl_encrypt($contenu, 'aes-256-gcm', $cle, OPENSSL_RAW_DATA, $iv, $marque, '', self::TAILLE_MARQUE);
        if ($donnees === false) {
            throw new RuntimeException('Le chiffrement a échoué.');
        }

        return self::MAGIE . pack('N', self::ITERATIONS) . $sel . $iv . $marque . $donnees;
    }

    /** Vrai si le fichier porte notre en-tête. */
    public static function estChiffre(string $fichier): bool
    {
        return str_starts_with($fichier, self::MAGIE) || str_starts_with($fichier, self::MAGIE_V1);
    }

    /**
     * Déchiffre un fichier produit par `chiffrer`.
     *
     * Les messages d'échec distinguent les cas qu'on rencontre réellement : ce
     * n'est pas une sauvegarde chiffrée, le format est celui de l'ancien
     * serveur, le mot de passe est faux, le fichier a été altéré. Un « erreur
     * de déchiffrement » générique laisserait chercher.
     */
    public static function dechiffrer(string $fichier, string $motDePasse): string
    {
        if (str_starts_with($fichier, self::MAGIE_V1)) {
            throw new RuntimeException(
                "Cette sauvegarde est au format 1, produit par l'ancien serveur Node : sa clé est dérivée "
                . "par scrypt, que PHP ne fournit pas ici. Déchiffrez-la avec « npm run restaurer » du dépôt."
            );
        }
        if (!str_starts_with($fichier, self::MAGIE)) {
            throw new RuntimeException("Ce fichier n'est pas une sauvegarde chiffrée VIZDATA.");
        }
        if ($motDePasse === '') {
            throw new RuntimeException('Cette sauvegarde est chiffrée : la clé est nécessaire pour la relire.');
        }

        $position = strlen(self::MAGIE);
        $lire = function (int $n) use ($fichier, &$position): string {
            $morceau = substr($fichier, $position, $n);
            $position += $n;
            return $morceau;
        };

        $iterations = unpack('N', $lire(4))[1] ?? 0;
        $sel = $lire(self::TAILLE_SEL);
        $iv = $lire(self::TAILLE_IV);
        $marque = $lire(self::TAILLE_MARQUE);
        $donnees = substr($fichier, $position);

        if ($iterations < 1000 || $donnees === '') {
            throw new RuntimeException('Sauvegarde vide, tronquée ou illisible.');
        }

        $cle = self::deriver($motDePasse, $sel, $iterations);
        $clair = openssl_decrypt($donnees, 'aes-256-gcm', $cle, OPENSSL_RAW_DATA, $iv, $marque);

        if ($clair === false) {
            /* GCM ne distingue pas « mauvaise clé » de « fichier altéré » :
               dans les deux cas la marque ne correspond pas. On le dit tel
               quel plutôt que d'affirmer l'un des deux. */
            throw new RuntimeException(
                'Déchiffrement refusé : la clé est incorrecte, ou le fichier a été altéré depuis sa création.'
            );
        }
        return $clair;
    }
}
