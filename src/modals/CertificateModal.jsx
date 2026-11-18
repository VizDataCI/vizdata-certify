/* Le certificat, en consultation ou en délivrance.
 *
 * Reçoit la forme publique normalisée — celle que rendent les fonctions
 * Supabase comme le registre local.
 *
 * Deux régimes, portés par « telechargeable »
 * -------------------------------------------
 * — consultation : ce que voit un employeur venu vérifier. Il constate
 *   l'authenticité, il ne repart pas avec le document. Ni téléchargement ni
 *   impression ne sont proposés, et la zone d'impression n'est pas montée :
 *   un Ctrl+P ne produit donc pas un certificat détouré prêt à circuler.
 * — délivrance : réservé au titulaire et à VIZDATA, seuls fondés à diffuser
 *   l'attestation. Téléchargement et impression sont là.
 *
 * Rien n'empêchera jamais une capture d'écran. Le propos n'est pas de rendre la
 * copie impossible, mais de ne pas la proposer : un document remis par le
 * registre à un tiers n'aurait pas le même sens qu'une vérification.
 */

import { useState } from "react";
import { STATUS_META } from "../lib/certificates.js";
import { Certificat, ZoneImpression, imprimerCertificat } from "../ui/Certificat.jsx";
import { Modal } from "../ui/primitives.jsx";

function CertificateModal({ cert, onClose, telechargeable = true, ...p }) {
  const st = cert.status;
  const [avis, setAvis] = useState("");

  const tracer = (action) => {
    if (cert.local_record && p.log) p.log(action, cert.local_record.id, cert.reference);
  };

  /* Les deux gestes ouvrent la même boîte de dialogue — celle du navigateur —
     et c'est voulu : son moteur produit un texte vectoriel, net à tout
     agrandissement, et exactement la mise en page de l'écran. Ce qui les
     distingue est le nom proposé pour le fichier, et ce qu'on dit à
     l'utilisateur. Le prétendre autrement serait mentir sur le mécanisme. */
  const telecharger = () => {
    tracer("CERTIFICATE_DOWNLOADED");
    setAvis("pdf");
    imprimerCertificat(cert.reference);
  };

  const imprimer = () => {
    tracer("CERTIFICATE_PRINTED");
    setAvis("impression");
    imprimerCertificat(cert.reference);
  };

  return (
    <Modal
      title={telechargeable ? `Certificat ${cert.reference}` : "Certificat, consultation"}
      onClose={onClose}
      taille="certificat"
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Fermer</button>
          {telechargeable && (
            <>
              <button className="vz-btn" onClick={imprimer}>Imprimer</button>
              <button className="vz-btn vz-btn-primary" onClick={telecharger}>Télécharger en PDF</button>
            </>
          )}
        </>
      }
    >
      {st !== "ACTIVE" && (
        <div className={"vz-alert " + (st === "EXPIRED" ? "warn" : "err")} style={{ marginBottom: 16 }}>
          {st === "EXPIRED"
            ? "Ce certificat est expiré. Le document reste consultable à titre d'archive."
            : `Ce certificat n'est plus en vigueur (${STATUS_META[st].label.toLowerCase()}).`}
        </div>
      )}

      <Certificat cert={cert} verifyUrl={p.verifyUrl(cert)} />

      {/* Le document n'est monté dans la zone d'impression que lorsqu'il a
          vocation à sortir du registre. En consultation publique, il n'y est
          pas : il n'y a donc rien à imprimer. */}
      {telechargeable && <ZoneImpression cert={cert} verifyUrl={p.verifyUrl(cert)} />}

      {telechargeable ? (
        <div className="vz-alert info" style={{ marginTop: 16 }}>
          {avis === "pdf"
            ? "Dans la boîte de dialogue, choisissez la destination « Enregistrer au format PDF ». Le fichier portera la référence du certificat."
            : avis === "impression"
            ? "Format A4, orientation paysage, marges nulles : ne modifiez pas ces réglages, le document est déjà à la dimension de la feuille."
            : "Le document est au format A4 paysage. Ce que vous voyez ici est exactement ce qui sera imprimé ou enregistré."}
        </div>
      ) : (
        <p className="vz-small vz-muted" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Cette page atteste de l'authenticité du certificat. Le document lui-même n'est délivré
          qu'à son titulaire, depuis son espace personnel, et par VIZDATA.
        </p>
      )}
    </Modal>
  );
}

export { CertificateModal };
