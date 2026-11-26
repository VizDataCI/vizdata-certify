/* Le certificat VIZDATA : document officiel.
 *
 * Pourquoi un gabarit en pixels fixes
 * -----------------------------------
 * Le document mesure 1123 × 794 pixels CSS. Ce n'est pas un chiffre arbitraire :
 * un navigateur imprime le pixel CSS à 96 points par pouce, et 1123 × 794 px à
 * 96 ppp font exactement 297 × 210 mm : une feuille A4 en paysage.
 *
 * La conséquence est ce que le cahier des charges exige : « le PDF téléchargé et
 * le document imprimé conservent exactement la même mise en page ». Le document
 * n'est jamais remis en page pour l'impression. À l'écran il est simplement
 * réduit par une transformation d'échelle ; sur le papier, l'échelle est retirée
 * et le gabarit tombe pile dans la feuille. Une seule mise en page, donc aucune
 * divergence possible entre ce qu'on voit et ce qu'on obtient.
 *
 * C'est aussi pourquoi aucune dimension intérieure n'est en pourcentage ni en
 * unité relative à la fenêtre : une seule mesure dépendante de l'écran suffirait
 * à faire mentir l'aperçu.
 *
 * Ce qui ne figure pas sur le document
 * ------------------------------------
 * Ni date d'expiration, ni score. Un certificat VIZDATA atteste d'un acquis ;
 * la note obtenue relève de l'évaluation, pas de l'attestation, et une date de
 * péremption ferait douter d'un acquis qui ne se perd pas.
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FORMULE_DELIVRANCE, typeCertificat } from "../lib/certificates.js";
import { fmtLong } from "../lib/dates.js";
import { QRCode } from "./QRCode.jsx";
import { VizdataLogo } from "./VizdataLogo.jsx";

/** Largeur et hauteur du gabarit, en pixels CSS. Une feuille A4 en paysage. */
const LARGEUR = 1123;
const HAUTEUR = 794;

/* Le cachet est servi depuis la racine du site plutôt qu'importé : il part
   ainsi tel quel dans le paquet, sous un nom stable, et le document imprimé
   ne dépend pas d'une empreinte de construction. */
const CACHET = "/cachet-vizdata.png";

/* --- le document ---------------------------------------------------------- */

function CertificatDocument({ cert, verifyUrl }) {
  /* Participation ou compétences : tout ce qui change d'un type à l'autre est
     tenu par ce seul objet : titre, phrase d'introduction, formule, et le fait
     d'énumérer ou non les compétences. Voir lib/certificates.js. */
  const type = typeCertificat(cert.kind);

  return (
    <div className="vzc" style={{ width: LARGEUR, height: HAUTEUR }}>
      {/* Bandeau de marque : trois segments pleins, pas un dégradé. Il situe
          le document d'un coup d'œil sans rien disputer au texte. */}
      <div className="vzc-bande" aria-hidden="true">
        <span style={{ background: "#1E7FA6" }} />
        <span style={{ background: "#F28C28" }} />
        <span style={{ background: "#4A2A63" }} />
      </div>

      <div className="vzc-corps">
        <header className="vzc-tete">
          <VizdataLogo w={128} />
          <div className="vzc-tete-droite">
            <div className="vzc-eyebrow">Certificat n°</div>
            <div className="vzc-reference">{cert.reference}</div>
            {cert.domain && <div className="vzc-domaine">{cert.domain}</div>}
          </div>
        </header>

        <div className="vzc-centre">
          <div className="vzc-titre">{type.label}</div>
          <div className="vzc-filet" aria-hidden="true" />

          <div className="vzc-mention">VIZDATA certifie que</div>
          <h1 className="vzc-nom">{cert.holder_name}</h1>

          <div className="vzc-mention">{type.mention}</div>
          <div className="vzc-programme">{cert.certification}</div>

          {cert.description && <p className="vzc-description">{cert.description}</p>}

          {/* Ce que le document atteste, dit en propres termes, puis la formule
              consacrée. Les deux phrases sont posées ensemble et centrées sous
              la description : séparées, l'une se lisait comme un commentaire du
              programme et l'autre comme une mention de pied. L'italique de la
              première la rattache à ce qui précède ; la seconde, en romain,
              clôt le dispositif. */}
          <p className="vzc-attestation">
            <em>{type.attestation}</em>
            <span>{FORMULE_DELIVRANCE}</span>
          </p>

          {type.competences && cert.skills?.length > 0 && (
            <div className="vzc-competences">
              {cert.skills.slice(0, 6).map((s) => (
                <span key={s} className="vzc-competence">{s}</span>
              ))}
            </div>
          )}
        </div>

        <footer className="vzc-pied">
          <div className="vzc-signature">
            {/* Le cachet de la Direction Générale, posé au-dessus du trait
                comme il le serait sur le papier. Il porte la signature : les
                deux ne se séparent pas. */}
            <img className="vzc-cachet" src={CACHET} alt="" aria-hidden="true" />
            <div className="vzc-signature-trait" />
            {/* Une seule ligne sous le trait, et c'est le signataire.
                Il y en avait deux : « Direction VIZDATA » puis « VIZDATA,
                Côte d'Ivoire ». La seconde répétait la première et situait un
                document qui n'a pas besoin d'être situé : il est cacheté,
                signé, et il porte une adresse de vérification qui dit d'où il
                vient mieux qu'une mention de pays. Une ligne de moins sous le
                trait, c'est une ligne de plus de silence autour de la
                signature, et c'est ce silence qui fait l'autorité. */}
            <div className="vzc-signature-nom">{cert.signatory || "Direction VIZDATA"}</div>
          </div>

          <div className="vzc-meta">
            <div>
              <div className="vzc-eyebrow">Délivré le</div>
              <div className="vzc-meta-valeur">{fmtLong(cert.issue_date)}</div>
            </div>
            {cert.duration ? (
              <div>
                <div className="vzc-eyebrow">Durée de la formation</div>
                <div className="vzc-meta-valeur">{cert.duration} heures</div>
              </div>
            ) : null}
            {/* Le formateur ne figure plus sur le document. Ce que le
                certificat atteste est l'acquis du titulaire ; qui a animé la
                session relève du dossier de formation, pas de l'attestation.
                Le champ reste saisi et conservé au registre. */}
          </div>

          {/* Le QR code au-dessus, sa légende dessous, et cette légende est
              bâtie comme les deux blocs qui la précèdent : un libellé en
              capitales interlettrées, une valeur en dessous. Les trois blocs
              du pied suivent dès lors la même grammaire, au lieu que le QR
              code soit un objet à part avec sa propre typographie.

              La légende est imprimée : elle doit désigner un chemin qui
              existe. Elle a un temps indiqué /verify, disparu lors du passage
              aux adresses françaises : un certificat imprimé alors renvoyait
              vers une page introuvable. */}
          <div className="vzc-qr">
            <QRCode value={verifyUrl} size={84} />
            <div className="vzc-qr-legende">
              <div className="vzc-eyebrow">Vérifier l'authenticité</div>
              <div className="vzc-qr-url">certify.vizdata.ci/verifier</div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* --- le cadre qui met le document à l'échelle de l'écran ----------------- */

/** Encadre le document et le réduit pour qu'il tienne dans la largeur
 *  disponible. L'échelle ne touche ni la mise en page ni l'impression : c'est
 *  une transformation visuelle, appliquée au gabarit entier. */
function Certificat({ cert, verifyUrl }) {
  const cadre = useRef(null);
  const [echelle, setEchelle] = useState(1);

  useEffect(() => {
    const element = cadre.current;
    if (!element) return;

    const ajuster = () => {
      const largeur = element.clientWidth;
      if (largeur > 0) setEchelle(Math.min(1, largeur / LARGEUR));
    };

    ajuster();

    /* ResizeObserver plutôt qu'un écouteur sur la fenêtre : le cadre peut
       changer de largeur sans que la fenêtre bouge : ouverture d'une modale,
       apparition d'une barre latérale. */
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", ajuster);
      return () => window.removeEventListener("resize", ajuster);
    }
    const observateur = new ResizeObserver(ajuster);
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  return (
    /* Le plateau gris porte la marge autour du document, et le cadre n'en a
       aucune. Ce n'est pas un détail de goût : l'échelle se calcule sur
       `clientWidth`, qui INCLUT le remplissage. Un `padding` posé sur le cadre
       aurait donc fait calculer le facteur sur une largeur plus grande que
       celle offerte au document, qui aurait débordé puis été rogné. */
    <div className="vzc-plateau">
      <div
        ref={cadre}
        className="vzc-cadre"
        style={{ height: HAUTEUR * echelle }}
      >
        <div className="vzc-echelle" style={{ transform: `scale(${echelle})` }}>
          <CertificatDocument cert={cert} verifyUrl={verifyUrl} />
        </div>
      </div>
    </div>
  );
}

/* --- la zone d'impression ------------------------------------------------ */

/** Rend le document dans `#impression`, le conteneur frère de l'application.
 *
 *  À l'écran ce conteneur est masqué ; à l'impression, c'est l'application
 *  entière qui disparaît et lui seul qui s'affiche. Rendre le document deux
 *  fois plutôt que de masquer l'interface autour est ce qui garantit une page
 *  et une seule : les anciennes recettes à base de `visibility: hidden`
 *  laissaient les éléments masqués occuper leur place, et le nombre de pages
 *  dépendait de la hauteur de l'écran sous-jacent.
 *
 *  Le document n'y est pas mis à l'échelle : son gabarit est déjà celui d'une
 *  feuille A4 en paysage. */
function ZoneImpression({ cert, verifyUrl }) {
  /* Le conteneur est écrit en dur dans index.html : il existe donc avant que
     React ne monte quoi que ce soit. Le lire dans l'initialiseur d'état plutôt
     que dans un effet évite un premier rendu à vide, et surtout une course
     avec l'impression, qui peut être demandée dans la même frappe. */
  const [hote] = useState(() => (typeof document === "undefined" ? null : document.getElementById("impression")));

  /* Tant qu'un document est monté ici, et seulement alors, l'impression ne
     porte que sur lui. Sans ce marqueur, la règle « masquer l'application à
     l'impression » s'appliquerait en permanence, et un Ctrl+P n'importe où dans
     la plateforme sortirait une page blanche : la page de vérification
     publique comprise, que l'on peut légitimement vouloir imprimer comme
     preuve de consultation. */
  useEffect(() => {
    if (!hote) return;
    const racine = document.documentElement;
    racine.classList.add("vz-document-pret");

    /* L'orientation de la feuille est posée ici, et pas dans la feuille de
       style, parce qu'une règle `@page` ne se laisse pas conditionner par une
       classe : déclarée à demeure, elle mettrait en paysage l'impression de
       n'importe quelle page de la plateforme. Montée et démontée avec le
       document, elle ne vaut que pour lui. */
    const feuille = document.createElement("style");
    feuille.textContent = "@page { size: A4 landscape; margin: 0; }";
    document.head.appendChild(feuille);

    return () => {
      racine.classList.remove("vz-document-pret");
      feuille.remove();
    };
  }, [hote]);

  if (!hote) return null;
  return createPortal(<CertificatDocument cert={cert} verifyUrl={verifyUrl} />, hote);
}

/** Ouvre la boîte d'impression du navigateur.
 *
 *  Le titre du document est remplacé le temps de l'opération : les navigateurs
 *  s'en servent pour proposer le nom du fichier PDF. Sans cela, le titulaire
 *  enregistre « VIZDATA CERTIFY, Registre officiel… .pdf » ; avec, il obtient
 *  « VIZ-2026-EXCEL-AVA-000125.pdf », qui se classe et se retrouve.
 *
 *  Pourquoi l'impression du navigateur plutôt qu'une bibliothèque PDF : le
 *  moteur d'impression produit un texte vectoriel, net à tout agrandissement,
 *  et c'est exactement la mise en page de l'écran. Les bibliothèques
 *  disponibles côté navigateur passent par une capture en pixels : plus lourde,
 *  et floue à l'impression. Le résultat serait moins bon pour un document
 *  officiel. */
function imprimerCertificat(reference) {
  const titreInitial = document.title;
  if (reference) document.title = reference;

  const restaurer = () => {
    document.title = titreInitial;
    window.removeEventListener("afterprint", restaurer);
  };
  window.addEventListener("afterprint", restaurer);

  /* Le délai laisse React peindre la zone d'impression avant que la boîte de
     dialogue ne gèle le rendu. Sans lui, le premier appel imprime une page
     vide sur les navigateurs qui ouvrent la boîte de façon synchrone. */
  setTimeout(() => {
    window.print();
    /* `afterprint` n'est pas déclenché partout : filet de sécurité. */
    setTimeout(restaurer, 1500);
  }, 120);
}

export { Certificat, CertificatDocument, ZoneImpression, imprimerCertificat, LARGEUR, HAUTEUR };
