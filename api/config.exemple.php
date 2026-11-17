<?php
/* Configuration du registre — MODÈLE.
 *
 * Copiez ce fichier en `config.php` sur le serveur et renseignez les valeurs.
 * `config.php` n'est PAS dans le dépôt : il porte la clé de chiffrement des
 * sauvegardes et le jeton d'installation.
 *
 * Tout ce qui est sensible vit ici, et ici seulement. Rien de ce fichier
 * n'entre dans le paquet livré au navigateur.
 */

declare(strict_types=1);

final class Config
{
    /* --- la base ------------------------------------------------------------
       HORS du dossier web, toujours. Un fichier servi par erreur livrerait
       tout le registre d'un coup : adresses, téléphones, empreintes de mots
       de passe. Sur cet hébergement, le dossier web est
       /var/www/vhosts/vizdata.ci/certify.vizdata.ci ; son parent est
       inscriptible et n'est servi par personne. */
    public const CHEMIN_BASE = '/var/www/vhosts/vizdata.ci/certify-registre/certify.db';
    public const DOSSIER_SAUVEGARDES = '/var/www/vhosts/vizdata.ci/certify-registre/sauvegardes';

    /* --- adresses ------------------------------------------------------------
       Celle qui figure dans les liens envoyés par courrier, et sous les QR
       codes. Sans barre finale. */
    public const SITE_URL = 'https://certify.vizdata.ci';

    /* --- courrier ------------------------------------------------------------
       Sans RESEND_API_KEY, les messages partent par la fonction mail() du
       serveur — qui ne dit pas si la remise a eu lieu. Avec, le fournisseur
       rend un verdict, et les échecs apparaissent dans l'écran Notifications. */
    public const COURRIER_ACTIF = true;
    public const RESEND_API_KEY = '';
    public const EXPEDITEUR = 'VIZDATA CERTIFY <certify@vizdata.ci>';
    public const REPONDRE_A = 'contact@vizdata.ci';
    /* Les candidatures de l'académie sont signalées à cette adresse. */
    public const ACADEMIE_NOTIFICATION = 'contact@vizdata.ci';

    /* --- sauvegardes ---------------------------------------------------------
       CONSERVEZ CETTE CLÉ AILLEURS QUE SUR CE SERVEUR. Sans elle, les
       sauvegardes sont des octets aléatoires — c'est exactement ce qu'on
       demande au chiffrement, et c'est sans appel.
       Pour en produire une : openssl rand -base64 32 */
    public const SAUVEGARDE_CLE = '';
    public const SAUVEGARDES_GARDEES = 30;

    /* Jeton d'une tâche planifiée qui appelle /api/sauvegarde. Le panneau
       Plesk sait récupérer une URL à heure fixe : c'est ainsi qu'on sauvegarde
       sans ligne de commande. Laissez vide pour interdire ce déclenchement. */
    public const JETON_SAUVEGARDE = '';

    /* --- installation --------------------------------------------------------
       Le premier administrateur est le seul compte que l'application ne peut
       pas créer elle-même : il n'y a personne pour l'inviter, et il n'y a pas
       de ligne de commande sur cet hébergement.
       /api/installation s'en charge, à deux conditions : ce jeton, et aucun
       compte existant. VIDEZ-LE une fois l'installation faite. */
    public const JETON_INSTALLATION = '';

    /* --- diagnostic ----------------------------------------------------------
       À true seulement le temps d'une mise au point : les messages d'erreur
       détaillés renseignent sur le schéma. */
    public const DEBOGUAGE = false;
}
