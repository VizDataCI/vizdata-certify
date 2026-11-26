<?php
/* Envoi des courriers du registre.
 *
 * Six messages, un seul gabarit
 * ----------------------------
 * Invitation, réinitialisation, certification attribuée, profil modifié,
 * l'accusé de candidature de l'académie et l'alerte interne qui l'accompagne.
 * Tous passent par le même gabarit en tableaux : c'est ce qui survit aux
 * clients de messagerie, qui ignorent flexbox et une bonne part du CSS.
 *
 * Deux chemins d'envoi, et pourquoi
 * ---------------------------------
 * `mail()` de PHP est disponible sur l'hébergement et suffit pour un volume
 * modeste. Resend est utilisé s'il est configuré : il rend un verdict de
 * remise, ce que `mail()` ne fait pas : il dit seulement que le message a été
 * confié au système.
 *
 * Ce que fait cette classe quand rien ne part
 * -------------------------------------------
 * Elle N'ÉCHOUE PAS. Elle inscrit la notification en attente, et rend le lien
 * à l'appelant. Attribuer un certificat ne doit pas échouer parce qu'un
 * e-mail n'a pas pu partir : le certificat est délivré, il est déjà visible
 * dans l'espace du titulaire, et l'écran Notifications montre ce qui n'est pas
 * parti.
 */

declare(strict_types=1);

final class Courrier
{
    private static function site(): string
    {
        return rtrim(Config::SITE_URL, '/');
    }

    private static function e(?string $s): string
    {
        return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * Le gabarit commun.
     *
     * Le logo est une image matricielle servie par le site, et non le SVG de
     * l'application : Gmail supprime le SVG, Outlook ne l'a jamais su. Le mot
     * « vizdata » reste écrit en toutes lettres sous l'image : les messageries
     * bloquent les images distantes par défaut, et la marque doit tenir même
     * quand le destinataire ne les a pas affichées.
     *
     * Le bouton est centré par l'attribut `align` d'un tableau, et pas par une
     * marge automatique : Outlook ignore `margin:auto`, et le bouton repartait
     * contre le bord gauche.
     */
    private static function gabarit(string $titre, string $intro, string $corps, ?array $lien = null): string
    {
        $site = self::site();
        $bouton = '';
        if ($lien !== null) {
            $url = self::e($lien['url']);
            $bouton = '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:26px 0 18px;">'
                . '<tr><td align="center">'
                . '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">'
                . '<tr><td align="center" style="background:#12688F;border-radius:999px;">'
                . '<a href="' . $url . '" style="display:inline-block;padding:14px 34px;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-weight:600;font-size:14.5px;text-decoration:none;white-space:nowrap;">'
                . self::e($lien['libelle']) . '</a></td></tr></table>'
                . '</td></tr></table>'
                . '<p style="margin:0 0 6px;font-size:12px;color:#8a91a0;text-align:center;">Si le bouton ne fonctionne pas, copiez cette adresse :</p>'
                . '<p style="margin:0;font-size:12px;color:#12688F;word-break:break-all;text-align:center;">' . $url . '</p>';
        }

        return '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' . self::e($titre) . '</title></head>'
            . '<body style="margin:0;padding:0;background:#F6F7F9;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F9;padding:32px 16px;">'
            . '<tr><td align="center">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E3E6EC;border-radius:10px;">'
            . '<tr><td align="center" style="padding:30px 30px 0;">'
            . '<img src="' . $site . '/logo-courriel.png" width="104" height="74" alt="VIZDATA" '
            . 'style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:104px;height:auto;">'
            . '<div style="font-family:Helvetica,Arial,sans-serif;font-weight:600;font-size:17px;color:#4A2A63;margin-top:10px;">vizdata</div>'
            . '<div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:.19em;text-transform:uppercase;color:#667085;margin-top:3px;">certify</div>'
            . '</td></tr>'
            . '<tr><td style="padding:22px 30px 30px;font-family:Helvetica,Arial,sans-serif;color:#101A2B;">'
            . '<h1 style="margin:0 0 14px;font-size:21px;font-weight:600;text-align:center;">' . self::e($titre) . '</h1>'
            . '<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#344054;">' . $intro . '</p>'
            . $corps . $bouton
            . '<p style="margin:22px 0 0;font-size:12.5px;line-height:1.6;color:#667085;border-top:1px solid #E3E6EC;padding-top:16px;">'
            . 'VIZDATA CERTIFY, registre officiel des certifications VIZDATA.<br>'
            . 'Vérifiez l\'authenticité d\'un certificat sur <a href="' . $site . '/verifier" style="color:#12688F;">certify.vizdata.ci/verifier</a>.'
            . '</p></td></tr></table></td></tr></table></body></html>';
    }

    private static function ligne(string $libelle, string $valeur, bool $mono = false): string
    {
        $style = $mono ? 'font-family:monospace;color:#12688F;' : '';
        return '<tr><td style="padding:14px 16px;border-bottom:1px solid #E3E6EC;font-size:13px;color:#667085;">'
            . self::e($libelle) . '</td>'
            . '<td style="padding:14px 16px;border-bottom:1px solid #E3E6EC;font-size:14px;text-align:right;'
            . $style . 'font-weight:600;">' . self::e($valeur) . '</td></tr>';
    }

    /** Compose un message. Rend ['sujet','html'] ou null si le genre est inconnu. */
    public static function composer(string $kind, array $p = []): ?array
    {
        $prenom = self::e($p['prenom'] ?? '');
        $site = self::site();

        /* Deux types de certificat, deux messages. Féliciter quelqu'un d'avoir
           « validé son parcours » alors qu'il reçoit un certificat de
           participation lui apprendrait, par le courriel, que le document dit
           autre chose que ce qu'on lui écrit. */
        $participation = ($p['type'] ?? '') === 'PARTICIPATION';

        return match ($kind) {
            'INVITATION' => [
                'sujet' => 'Votre accès à VIZDATA CERTIFY',
                'html' => self::gabarit(
                    'Bienvenue sur VIZDATA CERTIFY',
                    "Bonjour $prenom, un espace personnel vous a été ouvert sur le registre des certifications VIZDATA. Vous y retrouverez toutes vos certifications, à consulter, télécharger et imprimer.",
                    '<p style="margin:0;font-size:14px;line-height:1.6;color:#344054;">Choisissez votre mot de passe en suivant ce lien. Il est valable sept jours, et une seule fois.</p>',
                    ['url' => "$site/nouveau-mot-de-passe?jeton=" . ($p['jeton'] ?? ''), 'libelle' => 'Choisir mon mot de passe']
                ),
            ],
            'REINITIALISATION' => [
                'sujet' => 'Réinitialiser votre mot de passe',
                'html' => self::gabarit(
                    'Réinitialiser votre mot de passe',
                    "Bonjour $prenom, vous avez demandé à changer le mot de passe de votre compte VIZDATA CERTIFY.",
                    '<p style="margin:0;font-size:14px;line-height:1.6;color:#344054;">Ce lien est valable une heure, et une seule fois. Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>',
                    ['url' => "$site/nouveau-mot-de-passe?jeton=" . ($p['jeton'] ?? ''), 'libelle' => 'Choisir un nouveau mot de passe']
                ),
            ],
            /* Le message qu'on reçoit une fois, et qu'on garde.
               Il annonçait platement qu'une certification « est attribuée ».
               Derrière une certification il y a des semaines de travail : le
               message le dit, et félicite, avant de parler de références et de
               boutons. */
            'CERTIFICAT_ATTRIBUE' => [
                'sujet' => $participation
                    ? 'Félicitations ' . ($p['prenom'] ?? '') . ', votre certificat de participation est délivré'
                    : 'Félicitations ' . ($p['prenom'] ?? '') . ', votre certification ' . ($p['certification'] ?? '') . ' est délivrée',
                'html' => self::gabarit(
                    'Félicitations' . ($prenom !== '' ? " $prenom" : '') . ' !',
                    $participation
                        ? "Vous avez suivi ce programme jusqu'au bout, et VIZDATA a le plaisir de vous délivrer votre "
                          . "certificat de participation. C'est la trace de votre engagement et de votre assiduité."
                        : "Vous avez validé votre parcours, et VIZDATA a le plaisir de vous délivrer votre certification. "
                          . "C'est l'aboutissement de votre travail et de votre assiduité : prenez le temps d'en être fier.",
                    '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#344054;">'
                    . 'Votre certificat est dès maintenant enregistré au registre officiel VIZDATA. '
                    . 'Il porte une référence unique et un QR code : un employeur, un partenaire ou un recruteur '
                    . 'peut en vérifier l\'authenticité à tout moment, sans passer par vous.</p>'
                    . '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E3E6EC;border-radius:8px;">'
                    . self::ligne('Programme', (string) ($p['certification'] ?? ''))
                    . self::ligne('Type de certificat', $participation ? 'Certificat de participation' : 'Certificat de compétences')
                    . self::ligne('Domaine', (string) ($p['domaine'] ?? 'Non précisé'))
                    . self::ligne('Référence', (string) ($p['reference'] ?? ''), true)
                    . '</table>'
                    . '<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#344054;">'
                    . 'Depuis votre espace, vous pouvez le consulter, le télécharger en PDF, l\'imprimer '
                    . 'et le partager. '
                    . ($participation
                        ? 'Nous vous souhaitons de belles suites après ce parcours.'
                        : 'Nous vous souhaitons de belles suites avec ces compétences.')
                    . '</p>',
                    ['url' => "$site/espace", 'libelle' => 'Voir mon certificat']
                ),
            ],
            'PROFIL_MODIFIE' => [
                'sujet' => 'Vos informations ont été modifiées',
                'html' => self::gabarit(
                    'Vos informations ont été modifiées',
                    "Bonjour $prenom, les informations de votre compte VIZDATA CERTIFY viennent d'être modifiées par l'administration.",
                    '<p style="margin:0;font-size:14px;line-height:1.6;color:#344054;">'
                    . self::e($p['detail'] ?? 'Si cette modification vous surprend, signalez-le à VIZDATA.') . '</p>',
                    ['url' => "$site/espace", 'libelle' => 'Vérifier mon profil']
                ),
            ],
            'CANDIDATURE' => [
                'sujet' => 'Votre candidature CITIZEN DATA ANALYST (' . ($p['reference'] ?? '') . ')',
                'html' => self::gabarit(
                    'Votre candidature est enregistrée',
                    "Bonjour $prenom, nous avons bien reçu votre candidature à la formation CITIZEN DATA ANALYST. Nous revenons vers vous très vite sur WhatsApp.",
                    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E3E6EC;border-radius:8px;">'
                    . self::ligne('Référence', (string) ($p['reference'] ?? ''), true)
                    . '</table>'
                    . '<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#667085;">Citez cette référence si vous nous écrivez.</p>'
                ),
            ],
            /* L'alerte interne. Elle part vers VIZDATA, pas vers le candidat :
               elle porte le téléphone et l'adresse, et n'a rien à faire dans
               une boîte extérieure. Sans elle, une candidature n'existerait
               que dans l'écran d'administration : vue le jour où quelqu'un
               pense à l'ouvrir, ce qui n'est pas un délai acceptable pour
               rappeler un candidat. */
            'CANDIDATURE_ALERTE' => [
                'sujet' => 'Nouvelle candidature de ' . ($p['nom'] ?? '') . ' (' . ($p['reference'] ?? '') . ')',
                'html' => self::gabarit(
                    'Nouvelle candidature CITIZEN DATA ANALYST',
                    'Une candidature vient d\'être déposée sur la page de l\'académie.',
                    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E3E6EC;border-radius:8px;">'
                    . self::ligne('Référence', (string) ($p['reference'] ?? ''), true)
                    . self::ligne('Nom', (string) ($p['nom'] ?? ''))
                    . self::ligne('WhatsApp', (string) ($p['whatsapp'] ?? ''))
                    . self::ligne('E-mail', (string) ($p['email'] ?? ''))
                    . self::ligne('Profession', (string) ($p['profession'] ?? 'Non précisée'))
                    . self::ligne('Entreprise', (string) ($p['entreprise'] ?? 'Non précisée'))
                    . self::ligne('Niveau', (string) ($p['niveau'] ?? ''))
                    . self::ligne('Formule', (string) ($p['formule'] ?? ''))
                    . '</table>'
                    . (trim((string) ($p['motivation'] ?? '')) === '' ? '' :
                        '<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#344054;"><strong>Motivation</strong><br>'
                        . nl2br(self::e(mb_substr((string) $p['motivation'], 0, 1500))) . '</p>'),
                    ['url' => "$site/administration/academie", 'libelle' => 'Ouvrir les candidatures']
                ),
            ],
            default => null,
        };
    }

    /**
     * Envoie un message et en garde la trace.
     *
     * Ne lève jamais : l'appelant n'a pas à défaire une délivrance parce qu'un
     * courrier n'est pas parti. Le verdict est dans la valeur rendue et dans
     * la table `notifications`.
     *
     * @return array ['envoye' => bool, 'raison' => ?string, 'lien' => ?string]
     */
    public static function envoyer(array $options): array
    {
        $kind = (string) ($options['kind'] ?? '');
        $destinataire = (string) ($options['destinataire'] ?? '');
        $message = self::composer($kind, $options);

        if ($message === null) {
            return ['envoye' => false, 'raison' => "Type de message inconnu : $kind", 'lien' => null];
        }
        if (!filter_var($destinataire, FILTER_VALIDATE_EMAIL)) {
            return ['envoye' => false, 'raison' => 'Destinataire invalide.', 'lien' => null];
        }

        $lien = isset($options['jeton'])
            ? self::site() . '/nouveau-mot-de-passe?jeton=' . $options['jeton']
            : null;

        $trace = [
            'user_id'   => $options['utilisateurId'] ?? null,
            'recipient' => $destinataire,
            'kind'      => $kind,
            'subject'   => $message['sujet'],
            'payload'   => ['prenom' => $options['prenom'] ?? null, 'reference' => $options['reference'] ?? null],
        ];

        [$envoye, $raison] = self::expedier($destinataire, $message);

        Registre::tracerNotification($trace + [
            'status' => $envoye ? 'SENT' : 'PENDING',
            'error'  => $envoye ? null : $raison,
        ]);

        return ['envoye' => $envoye, 'raison' => $envoye ? null : $raison, 'lien' => $envoye ? null : $lien];
    }

    /** @return array{0: bool, 1: ?string} */
    private static function expedier(string $destinataire, array $message): array
    {
        if (Config::RESEND_API_KEY !== '') {
            return self::parResend($destinataire, $message);
        }
        if (!Config::COURRIER_ACTIF) {
            return [false, "L'envoi de courrier est désactivé sur cette installation."];
        }
        return self::parMail($destinataire, $message);
    }

    /** Resend : le fournisseur rend un verdict, ce que `mail()` ne fait pas. */
    private static function parResend(string $destinataire, array $message): array
    {
        $corps = json_encode([
            'from'    => Config::EXPEDITEUR,
            'to'      => [$destinataire],
            'subject' => $message['sujet'],
            'html'    => $message['html'],
        ], JSON_UNESCAPED_UNICODE);

        $ch = curl_init('https://api.resend.com/emails');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . Config::RESEND_API_KEY,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => $corps,
        ]);
        $reponse = curl_exec($ch);
        $statut = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $erreur = curl_error($ch);
        curl_close($ch);

        if ($reponse === false) {
            return [false, "Fournisseur injoignable : $erreur"];
        }
        if ($statut < 200 || $statut >= 300) {
            return [false, "Le fournisseur a refusé l'envoi ($statut) : " . mb_substr((string) $reponse, 0, 300)];
        }
        return [true, null];
    }

    /** `mail()` : disponible partout, mais ne dit que « confié au système ». */
    private static function parMail(string $destinataire, array $message): array
    {
        $entetes = [
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'From: ' . Config::EXPEDITEUR,
            'Reply-To: ' . Config::REPONDRE_A,
            'X-Mailer: VIZDATA CERTIFY',
        ];
        /* Le sujet est encodé : un accent non encodé dans un en-tête se
           transforme en caractères illisibles chez la plupart des clients. */
        $sujet = '=?UTF-8?B?' . base64_encode($message['sujet']) . '?=';

        $ok = @mail($destinataire, $sujet, $message['html'], implode("\r\n", $entetes));
        return $ok
            ? [true, null]
            : [false, "La fonction mail() du serveur a refusé le message."];
    }
}
