<?php
/* Le registre — point d'entrée unique.
 *
 * Toutes les requêtes `/api/*` arrivent ici, par la réécriture d'Apache (voir
 * le .htaccess du site). Le reste — l'interface construite — est servi
 * directement par le serveur web : ce fichier ne s'en occupe pas.
 *
 * Ce qui tient la sécurité, et dans quel ordre
 * --------------------------------------------
 * 1. La session est lue au début de chaque requête, depuis un cookie
 *    HttpOnly — donc inaccessible au JavaScript de la page, ce qui met les
 *    sessions hors de portée d'une faille d'injection dans l'interface.
 *    SameSite=Lax ferme la falsification de requête inter-site sans qu'il
 *    faille gérer de jeton anti-CSRF.
 * 2. Chaque route déclare si elle est publique. UNE ROUTE QUI NE LE DÉCLARE
 *    PAS EXIGE UNE SESSION : l'oubli penche du bon côté.
 * 3. L'autorisation fine est demandée à `Autorisations`, qui lève. Le routeur
 *    n'a qu'à traduire le refus en code HTTP.
 * 4. Les erreurs inattendues ne sortent jamais telles quelles : elles sont
 *    journalisées côté serveur et répondues en « une erreur interne ». Un
 *    message de SQLite renseignerait sur le schéma.
 */

declare(strict_types=1);

/* Les erreurs ne doivent jamais s'afficher : une trace de pile dans une
   réponse JSON renseigne sur les chemins du serveur et sur le schéma. */
ini_set('display_errors', '0');
error_reporting(E_ALL);

/* Sans config.php, PHP s'arrête sur une erreur fatale et répond une page vide :
   aucune indication, sur le seul oubli que tout déploiement risque de faire.
   Mieux vaut le dire, en JSON, comme le reste des réponses du registre. */
if (!is_file(__DIR__ . '/config.php')) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => "api/config.php est absent. Copiez api/config.exemple.php en api/config.php "
            . "et renseignez-le — voir docs/deploiement.md.",
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

require __DIR__ . '/config.php';
require __DIR__ . '/lib/Base.php';
require __DIR__ . '/lib/Autorisations.php';
require __DIR__ . '/lib/Comptes.php';
require __DIR__ . '/lib/Registre.php';
require __DIR__ . '/lib/Academie.php';
require __DIR__ . '/lib/Courrier.php';
require __DIR__ . '/lib/Chiffrement.php';
require __DIR__ . '/lib/Sauvegarde.php';

const COOKIE = 'vz_session';
const CORPS_MAX = 256 * 1024;

/* ========================================================================
   Outils HTTP
   ====================================================================== */

function repondre(int $statut, $corps = null, array $entetes = []): never
{
    http_response_code($statut);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    foreach ($entetes as $nom => $valeur) {
        header("$nom: $valeur");
    }
    if ($corps !== null) {
        echo json_encode($corps, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    exit;
}

/** Lit le corps JSON, borné. Un corps démesuré est refusé avant d'être lu. */
function corpsJson(): array
{
    $annonce = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($annonce > CORPS_MAX) {
        throw new Refus(413, 'Requête trop volumineuse.');
    }
    $brut = file_get_contents('php://input', false, null, 0, CORPS_MAX + 1);
    if ($brut === false || $brut === '') {
        return [];
    }
    if (strlen($brut) > CORPS_MAX) {
        throw new Refus(413, 'Requête trop volumineuse.');
    }
    $objet = json_decode($brut, true);
    if (!is_array($objet)) {
        throw new Refus(400, 'Corps de requête illisible.');
    }
    /* `json_decode('{}', true)` rend un tableau VIDE, que `array_is_list()` tient
       pour une liste : refuser les listes sans cette exception rejetterait un
       corps `{}` parfaitement légitime — le cas d'une route qui n'attend aucun
       champ. On ne refuse donc que les listes non vides. */
    if ($objet !== [] && array_is_list($objet)) {
        throw new Refus(400, 'Un objet JSON est attendu, pas une liste.');
    }
    return $objet;
}

/* `SameSite=Lax` plutôt que `None` : le cookie n'est jamais envoyé depuis un
   autre site, ce qui ferme la falsification de requête inter-site. `Secure`
   dès que le site est en HTTPS. */
function poserCookie(string $secret, int $duree = Comptes::DUREE_SESSION): void
{
    setcookie(COOKIE, $secret, [
        'expires'  => $duree > 0 ? time() + $duree : 1,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => str_starts_with(Config::SITE_URL, 'https://'),
    ]);
}

/** Empreinte d'adresse IP, pour la limitation de débit. Jamais l'adresse
 *  elle-même : elle n'a aucune raison d'être conservée en clair. */
function empreinteClient(): string
{
    $avance = trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))[0]);
    $adresse = $avance !== '' ? $avance : (string) ($_SERVER['REMOTE_ADDR'] ?? 'inconnu');
    return substr(hash('sha256', $adresse), 0, 22);
}

/* --- limitation de débit --------------------------------------------------
   PHP-FPM ne garde rien entre deux requêtes : le compteur vit dans un fichier,
   sous le dossier de la base. Il protège les deux portes qui comptent — la
   connexion et la demande de réinitialisation — contre l'essai en masse de
   mots de passe. Rien ne le fait à notre place sur cet hébergement. */
function limiter(string $cle, int $max, int $fenetre): void
{
    $dossier = dirname(Config::CHEMIN_BASE) . '/debit';
    if (!is_dir($dossier)) {
        @mkdir($dossier, 0750, true);
    }
    $fichier = $dossier . '/' . hash('sha256', $cle) . '.json';

    $t = time();
    $serie = [];
    if (is_file($fichier)) {
        $serie = json_decode((string) file_get_contents($fichier), true) ?: [];
    }
    $serie = array_values(array_filter($serie, fn ($d) => $t - (int) $d < $fenetre));
    $serie[] = $t;
    @file_put_contents($fichier, json_encode($serie), LOCK_EX);

    /* Ménage opportuniste : sans lui, le dossier grandirait indéfiniment. */
    if (random_int(1, 200) === 1) {
        foreach (glob($dossier . '/*.json') ?: [] as $vieux) {
            if (filemtime($vieux) < $t - 86400) {
                @unlink($vieux);
            }
        }
    }

    if (count($serie) > $max) {
        throw new Refus(429, 'Trop de tentatives. Réessayez dans quelques minutes.');
    }
}

/** Trace d'une consultation, pour la mesure. */
function traceVisiteur(): array
{
    return [
        'agent'       => mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200),
        'empreinteIp' => empreinteClient(),
        'pays'        => null,
    ];
}

/* --- la sauvegarde quotidienne, sans tâche planifiée ------------------------
 *
 * Pourquoi ce code existe
 * -----------------------
 * Le panneau de cet hébergement n'offre PAS de tâches planifiées à cet
 * abonnement : ni cron, ni « récupérer une URL ». La route GET /sauvegarde
 * reste là pour le jour où ce sera possible, mais compter dessus aujourd'hui
 * reviendrait à n'avoir aucune sauvegarde tout en croyant en avoir une — la
 * situation exacte qui a coûté le registre précédent.
 *
 * Le registre s'en charge donc lui-même : une fois par jour, la première
 * requête venue déclenche la sauvegarde — APRÈS avoir répondu.
 * `fastcgi_finish_request()` rend la main au visiteur, puis PHP continue :
 * personne n'attend, pas même celui qui a eu la malchance de passer en
 * premier.
 *
 * Ce que cela suppose, et qu'il faut savoir : un site sans aucune visite ne se
 * sauvegarde pas. Pour un registre qu'on consulte, c'est sans conséquence ;
 * pour un registre oublié pendant un mois, la dernière sauvegarde datera de la
 * dernière visite. L'écran Paramètres affiche cette date, précisément pour que
 * personne n'ait à le deviner.
 *
 * Trois garde-fous :
 *   — un témoin daté, pour ne regarder l'heure qu'une fois par jour (un stat,
 *     le contrôle le moins cher qui soit) ;
 *   — un verrou, pour que deux requêtes simultanées ne sauvegardent pas deux
 *     fois ;
 *   — un silence complet en cas d'échec : une sauvegarde ratée est consignée
 *     dans le journal du serveur, elle ne casse pas une page.
 */
const SAUVEGARDE_INTERVALLE = 20 * 3600;

function entretienAutomatique(): void
{
    $dossier = Config::DOSSIER_SAUVEGARDES;
    $temoin = $dossier . '/.derniere-sauvegarde';

    if (is_file($temoin) && time() - (int) filemtime($temoin) < SAUVEGARDE_INTERVALLE) {
        return;
    }
    if (!is_dir($dossier) && !@mkdir($dossier, 0750, true) && !is_dir($dossier)) {
        return;
    }

    $verrou = @fopen($dossier . '/.verrou', 'c');
    if ($verrou === false || !flock($verrou, LOCK_EX | LOCK_NB)) {
        return;
    }

    /* La réponse est déjà partie à ce point : le travail qui suit ne coûte
       rien au visiteur. */
    if (function_exists('fastcgi_finish_request')) {
        @fastcgi_finish_request();
    }

    try {
        /* Le témoin est posé AVANT la tentative. Sinon, une sauvegarde qui
           échoue — disque plein, droits perdus — serait retentée à CHAQUE
           requête, et transformerait une panne discrète en panne bruyante. */
        @touch($temoin);
        Sauvegarde::creer();
    } catch (Throwable $e) {
        error_log('[certify] sauvegarde automatique refusée : ' . $e->getMessage());
    } finally {
        flock($verrou, LOCK_UN);
        fclose($verrou);
    }
}

register_shutdown_function('entretienAutomatique');

/* ========================================================================
   Routes
   ====================================================================== */

$routes = [];
function route(string $methode, string $motif, callable $gestionnaire, bool $publique = false): void
{
    global $routes;
    $routes[] = ['methode' => $methode, 'motif' => $motif, 'gestionnaire' => $gestionnaire, 'publique' => $publique];
}

/* --- santé ---------------------------------------------------------------- */

route('GET', '#^/sante$#', fn () => ['etat' => 'ok', 'registre' => 'sqlite', 'moteur' => 'php'], true);

/* --- installation ---------------------------------------------------------
   Le premier administrateur. Deux verrous : le jeton du fichier de
   configuration, et l'absence de tout compte. Le second à lui seul suffirait
   presque ; le premier ferme la fenêtre de quelques secondes entre le dépôt
   des fichiers et le premier appel. */

route('POST', '#^/installation$#', function (array $params, ?array $acteur) {
    $corps = corpsJson();
    limiter('installation:' . empreinteClient(), 10, 3600);

    if (Config::JETON_INSTALLATION === '') {
        throw new Refus(403, "L'installation est close.");
    }
    if (!hash_equals(Config::JETON_INSTALLATION, (string) ($corps['jeton'] ?? ''))) {
        throw new Refus(403, "Jeton d'installation incorrect.");
    }
    if ((int) Base::valeur('select count(*) from users') > 0) {
        throw new Refus(403, "Le registre contient déjà des comptes : l'installation ne peut plus servir.");
    }

    $email = strtolower(trim((string) ($corps['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new Refus(400, "L'adresse e-mail n'est pas valide.");
    }

    $resultat = Registre::creerTitulaire(null, [
        'email' => $email,
        'first_name' => (string) ($corps['prenom'] ?? 'Direction'),
        'last_name' => (string) ($corps['nom'] ?? 'VIZDATA'),
        'role' => 'ADMIN',
    ]);
    $id = $resultat['titulaire']['id'];

    $jeton = Comptes::creerJeton($id, 'INVITATION');
    $courrier = Courrier::envoyer([
        'kind' => 'INVITATION',
        'destinataire' => $email,
        'utilisateurId' => $id,
        'prenom' => $resultat['titulaire']['first_name'],
        'jeton' => $jeton['secret'],
    ]);

    return [
        'installe' => true,
        'administrateur' => $email,
        'courrier_envoye' => $courrier['envoye'],
        /* Le lien est rendu ici parce que c'est le seul moment où il peut
           l'être sans danger : l'appelant détient le jeton d'installation,
           donc il a accès aux fichiers du serveur. */
        'lien' => Config::SITE_URL . '/nouveau-mot-de-passe?jeton=' . $jeton['secret'],
        'rappel' => "Videz JETON_INSTALLATION dans config.php maintenant.",
    ];
}, true);

/* --- chemin public --------------------------------------------------------- */

route('GET', '#^/verifier/([^/]+)$#', function (array $params) {
    $source = (string) ($_GET['source'] ?? 'qr');
    $resultat = Registre::verifierParJeton(rawurldecode($params[0]), $source, traceVisiteur());
    if ($resultat === null) {
        throw new Refus(404, "Ce lien ne correspond à aucun certificat du registre VIZDATA.");
    }
    return $resultat;
}, true);

route('GET', '#^/verifier$#', function () {
    $reference = trim((string) ($_GET['reference'] ?? ''));
    if ($reference === '') {
        throw new Refus(400, 'Référence manquante.');
    }
    /* Une référence se devine bien plus facilement qu'un jeton : on borne. */
    limiter('ref:' . empreinteClient(), 30, 60);

    $resultat = Registre::verifierParReference($reference, traceVisiteur());
    if ($resultat === null) {
        throw new Refus(404, 'Aucun certificat ne correspond à cette référence.');
    }
    return $resultat;
}, true);

route('GET', '#^/profil/([^/]+)$#', fn (array $p) => Registre::profilPublic(rawurldecode($p[0])), true);

route('POST', '#^/partage$#', function () {
    $corps = corpsJson();
    return ['enregistre' => Registre::enregistrerPartage(
        (string) ($corps['jeton'] ?? ''),
        $corps['plateforme'] ?? null
    )];
}, true);

/* --- session ---------------------------------------------------------------- */

route('POST', '#^/session$#', function () {
    $corps = corpsJson();
    $email = (string) ($corps['email'] ?? '');

    /* Deux compteurs : par adresse, pour protéger un compte visé ; par client,
       pour empêcher le balayage de nombreuses adresses depuis un même poste. */
    limiter('conn:' . strtolower($email), 10, 900);
    limiter('conn-ip:' . empreinteClient(), 40, 900);

    $resultat = Comptes::authentifier($email, (string) ($corps['motDePasse'] ?? ''));
    if (($resultat['refus'] ?? null) === 'desactive') {
        throw new Refus(403, 'Ce compte a été désactivé. Contactez VIZDATA.');
    }
    if (isset($resultat['refus'])) {
        throw new Refus(401, 'Adresse e-mail ou mot de passe incorrect.');
    }

    $session = Comptes::ouvrirSession(
        $resultat['compte']['id'],
        mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200)
    );
    poserCookie($session['secret']);
    return $resultat['compte'];
}, true);

route('GET', '#^/session$#', fn (array $p, ?array $acteur) => $acteur, true);

route('DELETE', '#^/session$#', function () {
    Comptes::fermerSession($_COOKIE[COOKIE] ?? null);
    poserCookie('', -1);
    return ['deconnecte' => true];
}, true);

/* --- mot de passe ------------------------------------------------------------ */

route('POST', '#^/mot-de-passe/oubli$#', function () {
    $corps = corpsJson();
    limiter('oubli:' . empreinteClient(), 5, 900);

    $compte = Comptes::parEmail((string) ($corps['email'] ?? ''));
    if ($compte !== null && $compte['account_status'] === 'ACTIVE') {
        $jeton = Comptes::creerJeton($compte['id'], 'REINITIALISATION');
        Courrier::envoyer([
            'kind' => 'REINITIALISATION',
            'destinataire' => $compte['email'],
            'utilisateurId' => $compte['id'],
            'prenom' => $compte['first_name'],
            'jeton' => $jeton['secret'],
        ]);
    }

    /* La réponse est la même dans tous les cas. Dire « adresse inconnue »
       permettrait de savoir qui est inscrit au registre en essayant des
       adresses une à une. */
    return ['envoye' => true];
}, true);

route('POST', '#^/mot-de-passe/definir$#', function () {
    $corps = corpsJson();
    limiter('definir:' . empreinteClient(), 20, 900);

    $souci = Comptes::qualiteMotDePasse($corps['motDePasse'] ?? null);
    if ($souci !== '') {
        throw new Refus(400, $souci);
    }

    $verdict = Comptes::consommerJeton((string) ($corps['jeton'] ?? ''));
    if (($verdict['refus'] ?? null) === 'expire') {
        throw new Refus(410, "Ce lien a expiré. Les liens ne sont valables qu'un temps, et une seule fois.");
    }
    if (isset($verdict['refus'])) {
        throw new Refus(410, "Ce lien n'est plus valable. Demandez-en un nouveau.");
    }

    Comptes::definirMotDePasse($verdict['utilisateurId'], (string) $corps['motDePasse']);

    /* On ouvre la session dans la foulée : la personne vient de prouver
       qu'elle a accès à sa messagerie et vient de choisir son mot de passe.
       Lui redemander de se connecter serait une étape pour rien. */
    $session = Comptes::ouvrirSession(
        $verdict['utilisateurId'],
        mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200)
    );
    poserCookie($session['secret']);
    return Comptes::parId($verdict['utilisateurId']);
}, true);

route('POST', '#^/mot-de-passe/changer$#', function (array $p, array $acteur) {
    $corps = corpsJson();
    $ancien = (string) ($corps['ancien'] ?? '');
    $nouveau = (string) ($corps['nouveau'] ?? '');

    $souci = Comptes::qualiteMotDePasse($nouveau);
    if ($souci !== '') {
        throw new Refus(400, $souci);
    }
    if ($ancien === $nouveau) {
        throw new Refus(400, 'Le nouveau mot de passe doit être différent de l\'ancien.');
    }

    /* L'ancien mot de passe est exigé. Sans ce contrôle, un poste laissé
       déverrouillé suffirait à prendre le compte. */
    $ligne = Base::un('select password_hash from users where id = ?', [$acteur['id']]);
    if (!Comptes::verifierMotDePasse($ancien, $ligne['password_hash'] ?? null)) {
        limiter('changer:' . $acteur['id'], 10, 900);
        throw new Refus(400, 'Votre mot de passe actuel est incorrect.');
    }

    Comptes::definirMotDePasse($acteur['id'], $nouveau, $_COOKIE[COOKIE] ?? null);
    return ['modifie' => true];
});

/* --- espace du titulaire ------------------------------------------------------ */

route('GET', '#^/mes-certificats$#', fn (array $p, array $acteur) => Registre::certificatsDe($acteur['id']));

route('PATCH', '#^/moi$#', function (array $p, array $acteur) {
    $champs = corpsJson();
    Autorisations::exigerEcritureCompte($acteur, $acteur, $champs);
    return Registre::majCompte($acteur, $acteur['id'], $champs);
});

/* --- administration : lecture -------------------------------------------------- */

route('GET', '#^/registre$#', function (array $p, array $acteur) {
    Autorisations::exigerAdministration($acteur);
    return Registre::complet(Autorisations::estAdmin($acteur));
});

route('GET', '#^/certificats/([^/]+)$#', function (array $p, array $acteur) {
    $ligne = Base::un('select * from certificates where id = ?', [$p[0]]);
    return Autorisations::exigerLectureCertificat($acteur, $ligne);
});

/* --- administration : comptes --------------------------------------------------- */

route('POST', '#^/titulaires$#', function (array $p, array $acteur) {
    $corps = corpsJson();
    Autorisations::exigerCreationCompte($acteur, $corps['role'] ?? null);

    if (!filter_var((string) ($corps['email'] ?? ''), FILTER_VALIDATE_EMAIL)) {
        throw new Refus(400, "L'adresse e-mail n'est pas valide.");
    }
    if (trim((string) ($corps['first_name'] ?? '')) === '' || trim((string) ($corps['last_name'] ?? '')) === '') {
        throw new Refus(400, 'Le prénom et le nom sont obligatoires.');
    }

    $resultat = Registre::creerTitulaire($acteur, $corps);
    if ($resultat['existe']) {
        return $resultat + ['invitation_envoyee' => false, 'lien' => null, 'avertissement' => null];
    }

    $jeton = Comptes::creerJeton($resultat['titulaire']['id'], 'INVITATION');
    $courrier = Courrier::envoyer([
        'kind' => 'INVITATION',
        'destinataire' => $resultat['titulaire']['email'],
        'utilisateurId' => $resultat['titulaire']['id'],
        'prenom' => $resultat['titulaire']['first_name'],
        'jeton' => $jeton['secret'],
    ]);

    return $resultat + [
        'invitation_envoyee' => $courrier['envoye'],
        /* Le lien n'est rendu que lorsqu'aucun courrier n'a pu partir, et
           seulement à l'administrateur qui vient de créer le compte : sans
           cela, le titulaire serait bloqué dehors en attendant qu'un
           fournisseur d'envoi soit configuré. */
        'lien' => $courrier['lien'],
        'avertissement' => $courrier['envoye'] ? null
            : "Le compte est créé mais l'invitation n'a pas pu être envoyée (" . $courrier['raison'] . ').',
    ];
});

route('PATCH', '#^/comptes/([^/]+)$#', function (array $p, array $acteur) {
    $cible = Comptes::parId($p[0]);
    $champs = corpsJson();
    Autorisations::exigerEcritureCompte($acteur, $cible, $champs);

    /* Retirer ses droits au dernier administrateur actif, ou le désactiver,
       laisserait la plateforme sans gouvernail. */
    $retrograde = array_key_exists('role', $champs) && $champs['role'] !== 'ADMIN';
    $desactive = ($champs['account_status'] ?? null) === 'DISABLED';
    if ($cible['role'] === 'ADMIN' && ($retrograde || $desactive)) {
        Autorisations::exigerDernierAdministrateur($cible['id']);
    }

    $maj = Registre::majCompte($acteur, $cible['id'], $champs);

    /* Un compte désactivé doit l'être tout de suite, y compris pour les
       sessions déjà ouvertes ailleurs. */
    if ($desactive) {
        Comptes::fermerToutesSessions($cible['id']);
    }
    if (isset($champs['email']) && strtolower(trim((string) $champs['email'])) !== $cible['email']) {
        Courrier::envoyer([
            'kind' => 'PROFIL_MODIFIE',
            'destinataire' => $maj['email'],
            'utilisateurId' => $cible['id'],
            'prenom' => $maj['first_name'],
            'detail' => "Votre adresse e-mail a été modifiée par l'administration.",
        ]);
    }
    return $maj;
});

route('POST', '#^/comptes/([^/]+)/invitation$#', function (array $p, array $acteur) {
    Autorisations::exigerAutorisation($acteur, 'creer_titulaires');
    $cible = Comptes::parId($p[0]);
    if ($cible === null) {
        throw new Refus(404, 'Compte introuvable.');
    }

    $jeton = Comptes::creerJeton($cible['id'], 'INVITATION');
    $courrier = Courrier::envoyer([
        'kind' => 'INVITATION',
        'destinataire' => $cible['email'],
        'utilisateurId' => $cible['id'],
        'prenom' => $cible['first_name'],
        'jeton' => $jeton['secret'],
    ]);
    return ['envoye' => $courrier['envoye'], 'lien' => $courrier['lien'], 'raison' => $courrier['raison']];
});

/* --- administration : certificats ------------------------------------------------ */

route('POST', '#^/certificats$#', function (array $p, array $acteur) {
    Autorisations::exigerAutorisation($acteur, 'attribuer_certificats');
    $corps = corpsJson();

    $cree = Registre::creerCertificat($acteur, $corps);

    $avisEnvoye = false;
    if (($corps['notifier'] ?? true) !== false) {
        $vue = Base::un('select * from v_certificats_publics where id = ?', [$cree['id']]);
        $titulaire = Comptes::parId($corps['user_id']);
        $courrier = Courrier::envoyer([
            'kind' => 'CERTIFICAT_ATTRIBUE',
            'destinataire' => $titulaire['email'],
            'utilisateurId' => $titulaire['id'],
            'prenom' => $titulaire['first_name'],
            'certification' => $vue['certification'],
            'domaine' => $vue['domain'],
            'reference' => $vue['reference'],
        ]);
        $avisEnvoye = $courrier['envoye'];
    }

    return ['certificat' => $cree, 'avis_envoye' => $avisEnvoye];
});

route('PATCH', '#^/certificats/([^/]+)$#', function (array $p, array $acteur) {
    Autorisations::exigerAutorisation($acteur, 'attribuer_certificats');
    $corps = corpsJson();
    $skills = $corps['skills'] ?? null;
    unset($corps['skills']);
    return Registre::majCertificat($acteur, $p[0], $corps, $skills);
});

route('POST', '#^/certificats/([^/]+)/statut$#', function (array $p, array $acteur) {
    $corps = corpsJson();
    $statut = (string) ($corps['statut'] ?? '');
    Autorisations::exigerAutorisation(
        $acteur,
        $statut === 'ACTIVE' ? 'attribuer_certificats' : 'revoquer_certificats'
    );
    if ($statut === 'REVOKED' && trim((string) ($corps['motif'] ?? '')) === '') {
        throw new Refus(400, 'Le motif est obligatoire pour une révocation : il est affiché publiquement.');
    }
    return Registre::changerStatutCertificat($acteur, $p[0], $statut, $corps['motif'] ?? null);
});

/* --- administration : catalogue ---------------------------------------------------- */

route('POST', '#^/domaines$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    return Registre::creerDomaine($acteur, corpsJson());
});

route('PATCH', '#^/domaines/([^/]+)$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    return Registre::majDomaine($acteur, $p[0], corpsJson());
});

route('POST', '#^/programmes$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    return Registre::creerProgramme($acteur, corpsJson());
});

route('PATCH', '#^/programmes/([^/]+)$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    return Registre::majProgramme($acteur, $p[0], corpsJson());
});

/* Le référentiel des compétences. Il manquait, et son absence se voyait à
   l'attribution : la base ne contenant aucune compétence, le formulaire
   proposait celles de la démonstration, dont les identifiants n'existent pas
   en production. Les cocher faisait échouer l'enregistrement sur la clé
   étrangère, et l'écran répondait « Les données envoyées ne sont pas
   valides. » sans dire laquelle. */
route('POST', '#^/competences$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    return Registre::creerCompetence($acteur, corpsJson());
});

route('PATCH', '#^/competences/([^/]+)$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    return Registre::majCompetence($acteur, $p[0], corpsJson());
});

/* --- sauvegardes -------------------------------------------------------------------
   Sans ligne de commande, la sauvegarde se déclenche par HTTP : le bouton de
   l'administration (POST), ou une tâche planifiée qui récupère l'adresse avec
   son jeton (GET).
   Sur l'hébergement de VIZDATA, le panneau n'offre AUCUNE tâche planifiée à
   cet abonnement : c'est `entretienAutomatique()`, plus haut, qui s'en charge.
   Ces deux routes restent utiles — le bouton, et le jour où un vrai cron
   deviendra possible. */

route('POST', '#^/sauvegarde$#', function (array $p, ?array $acteur) {
    $jeton = (string) ($_GET['jeton'] ?? '');
    $parTache = Config::JETON_SAUVEGARDE !== '' && hash_equals(Config::JETON_SAUVEGARDE, $jeton);
    if (!$parTache) {
        Autorisations::exigerAdmin($acteur);
    }
    try {
        return Sauvegarde::creer();
    } catch (Refus $e) {
        throw $e;
    } catch (Throwable $e) {
        throw new Refus(500, $e->getMessage());
    }
}, true);

/* La même sauvegarde, en GET.
   Ce n'est pas une facilité : la tâche planifiée de Plesk est de type
   « Récupérer une URL » et fait une requête GET. Sans cette route, la
   sauvegarde nocturne répondrait 405 chaque nuit — et personne ne regarde le
   journal d'une tâche qui « tourne ».
   Le jeton est ici le SEUL moyen d'entrer : une session d'administrateur ne
   suffit pas, parce qu'un GET se déclenche depuis n'importe quelle page
   extérieure — une balise <img> suffirait — et lancerait des sauvegardes à
   l'insu de l'administrateur connecté. */
route('GET', '#^/sauvegarde$#', function () {
    $jeton = (string) ($_GET['jeton'] ?? '');
    if (Config::JETON_SAUVEGARDE === '' || !hash_equals(Config::JETON_SAUVEGARDE, $jeton)) {
        /* Un seul message pour les deux cas : distinguer « pas de jeton
           configuré » de « mauvais jeton » renseignerait sur la configuration. */
        throw new Refus(403, 'Jeton de sauvegarde absent ou incorrect.');
    }
    limiter('sauvegarde:' . empreinteClient(), 12, 3600);
    try {
        return Sauvegarde::creer();
    } catch (Refus $e) {
        throw $e;
    } catch (Throwable $e) {
        throw new Refus(500, $e->getMessage());
    }
}, true);

route('GET', '#^/sauvegardes$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    return Sauvegarde::lister();
});

route('POST', '#^/sauvegardes/restaurer$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    $corps = corpsJson();
    return Sauvegarde::restaurer((string) ($corps['nom'] ?? ''), ($corps['confirme'] ?? false) === true);
});

/* --- académie : page publique --------------------------------------------------- */

route('GET', '#^/academie/cohorte$#', fn () => Academie::cohortePubliee(), true);

route('POST', '#^/academie/candidature$#', function () {
    limiter('candidature:' . empreinteClient(), 8, 3600);
    $corps = corpsJson();
    $reference = Academie::soumettreCandidature($corps, (string) ($corps['source'] ?? 'page-academie'));

    /* L'accusé part APRÈS l'enregistrement, et son échec ne fait jamais
       échouer la candidature : l'administration la voit dans tous les cas. */
    $accuse = Courrier::envoyer([
        'kind' => 'CANDIDATURE',
        'destinataire' => strtolower(trim((string) $corps['email'])),
        'prenom' => explode(' ', trim((string) $corps['nom']))[0],
        'reference' => $reference,
    ]);

    /* Et l'alerte interne, vers VIZDATA. Une candidature qui n'attend que
       l'ouverture d'un écran d'administration est une candidature qu'on
       rappelle trop tard. Le corps de la requête sert de charge utile : il a
       déjà été validé champ par champ, et tout y est échappé à l'affichage. */
    if (Config::ACADEMIE_NOTIFICATION !== '') {
        Courrier::envoyer([
            'kind' => 'CANDIDATURE_ALERTE',
            'destinataire' => Config::ACADEMIE_NOTIFICATION,
            'reference' => $reference,
        ] + $corps);
    }

    /* Le verdict de l'accusé revient au formulaire, qui adapte son message de
       confirmation. Seul le booléen sort : la RAISON d'un échec d'envoi parle
       du fournisseur et de la configuration, et ce point de route est public. */
    return ['reference' => $reference, 'courriel' => ['envoye' => $accuse['envoye']]];
}, true);

/* --- académie : administration ---------------------------------------------------- */

route('GET', '#^/academie/candidatures$#', function (array $p, array $acteur) {
    Autorisations::exigerAdministration($acteur);
    return Academie::listerCandidatures();
});

route('GET', '#^/academie/cohortes$#', function (array $p, array $acteur) {
    Autorisations::exigerAdministration($acteur);
    return Academie::listerCohortes();
});

route('PATCH', '#^/academie/candidatures/([^/]+)$#', function (array $p, array $acteur) {
    Autorisations::exigerAdministration($acteur);
    return Academie::majCandidature($acteur, $p[0], corpsJson());
});

route('POST', '#^/academie/cohortes$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    return Academie::enregistrerCohorte($acteur, corpsJson());
});

route('PATCH', '#^/academie/cohortes/([^/]+)$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    return Academie::enregistrerCohorte($acteur, ['id' => $p[0]] + corpsJson());
});

route('POST', '#^/academie/cohortes/([^/]+)/publier$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    return Academie::publierCohorte($acteur, $p[0]);
});

route('DELETE', '#^/academie/cohortes/([^/]+)$#', function (array $p, array $acteur) {
    Autorisations::exigerAdmin($acteur);
    if (!Academie::supprimerCohorte($acteur, $p[0])) {
        throw new Refus(404, 'Cohorte introuvable.');
    }
    return ['supprime' => true];
});

/* ========================================================================
   Boucle de traitement
   ====================================================================== */

$chemin = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
/* Le préfixe /api est retiré : les motifs ci-dessus décrivent ce qui suit. */
$chemin = preg_replace('#^/api#', '', $chemin) ?: '/';
$chemin = rtrim($chemin, '/') ?: '/';
$methode = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

try {
    $secret = $_COOKIE[COOKIE] ?? null;
    $acteur = $secret !== null ? Comptes::sessionDepuisSecret($secret) : null;

    $trouvee = null;
    $params = [];
    $methodesPossibles = [];
    foreach ($routes as $r) {
        if (!preg_match($r['motif'], $chemin, $m)) {
            continue;
        }
        $methodesPossibles[] = $r['methode'];
        if ($r['methode'] === $methode) {
            $trouvee = $r;
            $params = array_slice($m, 1);
            break;
        }
    }

    if ($trouvee === null) {
        if ($methodesPossibles) {
            /* Si le chemin existe mais pas avec cette méthode, le dire :
               « route inconnue » enverrait chercher une faute d'adresse là où
               il n'y en a pas. La table des routes n'est pas un secret. */
            repondre(405, ['error' => 'Méthode non autorisée. Utilisez ' . implode(' ou ', $methodesPossibles) . '.'],
                ['Allow' => implode(', ', $methodesPossibles)]);
        }
        repondre(404, ['error' => 'Route inconnue.']);
    }

    /* Une route qui ne se déclare pas publique exige une session : l'oubli
       penche du bon côté. */
    if (!$trouvee['publique']) {
        Autorisations::exigerSession($acteur);
    }

    /* Un peu de ménage, de temps en temps : sans tâche planifiée, c'est la
       seule occasion de retirer sessions et jetons périmés. */
    if (random_int(1, 500) === 1) {
        Comptes::menage();
    }

    $resultat = ($trouvee['gestionnaire'])($params, $acteur);
    repondre($resultat === null && $methode !== 'GET' ? 204 : 200, $resultat);
} catch (Refus $e) {
    repondre($e->statut, ['error' => $e->getMessage()]);
} catch (Throwable $e) {
    /* Les contraintes de la base portent des messages clairs pour nous, et
       révélateurs pour un attaquant : on garde le détail côté serveur. */
    error_log('[certify] ' . $methode . ' ' . $chemin . ' — ' . $e->getMessage());

    $message = $e->getMessage();
    if (str_contains($message, 'UNIQUE constraint')) {
        repondre(409, ['error' => 'Cette valeur existe déjà dans le registre.']);
    }
    if (preg_match('/CHECK constraint|FOREIGN KEY|NOT NULL/i', $message)) {
        repondre(400, ['error' => 'Les données envoyées ne sont pas valides.']);
    }
    repondre(500, Config::DEBOGUAGE
        ? ['error' => $message, 'ou' => $e->getFile() . ':' . $e->getLine()]
        : ['error' => 'Une erreur interne est survenue.']);
}
