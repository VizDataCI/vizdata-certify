/* À propos du registre.
 *
 * La page se présentait comme une carte flottante au milieu de l'écran, ce qui
 * la faisait lire comme une fenêtre surgissante : un texte de présentation
 * n'est pas une boîte de dialogue, il n'y a rien à fermer ni à valider. Elle
 * prend donc la même forme que la page de vérification — un entête, un texte,
 * une action — et les deux pages publiques se ressemblent enfin.
 *
 * Trois paragraphes, pas quatre. Ce qui est écrit ici engage VIZDATA : chaque
 * phrase est une affirmation vérifiable sur cette plateforme, et non une
 * promesse de brochure.
 */

import { ORGANISME } from "../../lib/organisme.js";
import { IconeDroite, IconeRecherche } from "../../ui/icones.jsx";
import { PublicShell } from "./PublicShell.jsx";

function About(p) {
  return (
    <PublicShell {...p}>
      <div className="vz-page-texte">
        <div className="vz-eyebrow">À propos</div>
        <h1 className="vz-titre-section">La preuve numérique de vos certifications</h1>

        <div className="vz-prose">
          <p>
            VIZDATA CERTIFY est la plateforme officielle de gestion et de vérification des certificats
            délivrés par VIZDATA, organisme de formation établi à {ORGANISME.lieu}.
          </p>
          <p>
            Chaque certificat porte une référence unique et un QR code qui renvoie vers sa page de
            vérification. Le statut affiché sur cette page fait foi : un certificat révoqué ou expiré
            n'y apparaît jamais comme valide, et un certificat de participation n'y est jamais présenté
            comme une validation de compétences.
          </p>
          <p>
            La vérification est publique, gratuite, et ne demande aucun compte. Elle ne révèle rien
            d'autre que ce qui figure sur le document : ni adresse, ni téléphone, ni identifiant.
          </p>
        </div>

        <div className="vz-page-texte-actions">
          <button className="vz-btn vz-btn-primary" onClick={() => p.go({ view: "verify" })}>
            <IconeRecherche size={16} /> Vérifier un certificat
          </button>
          <a className="vz-btn" href={ORGANISME.site} target="_blank" rel="noopener noreferrer">
            {ORGANISME.siteAffiche} <IconeDroite size={15} />
          </a>
        </div>
      </div>
    </PublicShell>
  );
}

export { About };
