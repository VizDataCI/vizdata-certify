/* Le certificat, en consultation ou en téléchargement.

   Reçoit la forme publique normalisée — celle que rendent les fonctions
   Supabase comme le registre local.

   Deux régimes, portés par « telechargeable » :

   — consultation : ce que voit un employeur venu vérifier. Il constate
     l'authenticité, il ne repart pas avec le document. La zone d'impression
     n'est pas déclarée, de sorte qu'un Ctrl+P ne produit pas un certificat
     détouré prêt à circuler.
   — téléchargement : réservé au titulaire et à VIZDATA, seuls fondés à
     diffuser l'attestation.

   Rien n'empêchera jamais une capture d'écran. Le propos n'est pas de rendre
   la copie impossible, mais de ne pas la proposer : un document remis par le
   registre à un tiers n'aurait pas le même sens qu'une vérification. */

import { STATUS_META } from "../lib/certificates.js";
import { fmtShort } from "../lib/dates.js";
import { QRCode } from "../ui/QRCode.jsx";
import { VizdataLogo } from "../ui/VizdataLogo.jsx";
import { Modal } from "../ui/primitives.jsx";

function CertificateModal({ cert, onClose, telechargeable = true, ...p }) {
  const st = cert.status;

  const print = () => {
    if (cert.local_record) p.log("CERTIFICATE_DOWNLOADED", cert.local_record.id, cert.reference);
    setTimeout(() => window.print(), 60);
  };

  return (
    <Modal
      title={telechargeable ? "Certificat" : "Certificat — consultation"}
      onClose={onClose}
      wide
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Fermer</button>
          {telechargeable && (
            <button className="vz-btn vz-btn-primary" onClick={print}>Enregistrer en PDF</button>
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
      <div className={"vz-cert" + (telechargeable ? " vz-printarea" : "")}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <VizdataLogo w={96} />
          <div style={{ textAlign: "right" }}>
            <div className="vz-eyebrow">Référence</div>
            <div className="vz-ref vz-small" style={{ marginTop: 4 }}>{cert.reference}</div>
          </div>
        </div>
        <div className="vz-cert-title">Certificat de compétences</div>
        <div className="vz-small vz-muted" style={{ marginTop: 18 }}>Décerné à</div>
        <div className="vz-cert-name">{cert.holder_name}</div>
        <div className="vz-cert-rule" />
        <div style={{ fontSize: 17, fontWeight: 600 }}>{cert.certification}</div>
        <p className="vz-small vz-muted" style={{ marginTop: 8, maxWidth: 440, lineHeight: 1.6 }}>
          {cert.description} Parcours de {cert.duration} heures{cert.score != null ? `, validé avec un score de ${cert.score}/100` : ""}.
        </p>
        <div style={{ display: "flex", gap: 26, marginTop: 18, flexWrap: "wrap" }}>
          <div>
            <div className="vz-eyebrow">Émission</div>
            <div className="vz-mono vz-small" style={{ marginTop: 4 }}>{fmtShort(cert.issue_date)}</div>
          </div>
          <div>
            <div className="vz-eyebrow">Expiration</div>
            <div className="vz-mono vz-small" style={{ marginTop: 4 }}>{cert.expiry_date ? fmtShort(cert.expiry_date) : "—"}</div>
          </div>
          <div>
            <div className="vz-eyebrow">Formateur</div>
            <div className="vz-small" style={{ marginTop: 4 }}>{cert.trainer}</div>
          </div>
        </div>
        <div className="vz-cert-foot">
          <div>
            <div style={{ width: 150, height: 1, background: "var(--encre)" }} />
            <div className="vz-small" style={{ marginTop: 6, fontWeight: 500 }}>{cert.signatory}</div>
            <div className="vz-small vz-muted">VIZDATA</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <QRCode value={p.verifyUrl(cert)} size={124} />
            <div className="vz-mono" style={{ fontSize: 8.5, color: "var(--gris)", marginTop: 4 }}>certify.vizdata.ci/verify</div>
          </div>
        </div>
      </div>
      <p className="vz-small vz-muted" style={{ marginTop: 12 }}>
        {telechargeable
          ? "« Enregistrer en PDF » ouvre la boîte d'impression du navigateur : choisissez la destination « Enregistrer au format PDF »."
          : "Cette page atteste de l'authenticité du certificat. Le document lui-même n'est délivré qu'à son titulaire et par VIZDATA."}
      </p>
    </Modal>
  );
}

export { CertificateModal };
