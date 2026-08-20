/* Certificat imprimable.

   Reçoit la forme publique normalisée — celle que rendent les fonctions
   Supabase comme le registre local. L'enregistrement du téléchargement dans
   l'historique n'a lieu que si l'enregistrement local est disponible. */

import { STATUS_META } from "../lib/certificates.js";
import { fmtShort } from "../lib/dates.js";
import { QRCode } from "../ui/QRCode.jsx";
import { VizdataLogo } from "../ui/VizdataLogo.jsx";
import { Modal } from "../ui/primitives.jsx";

function CertificateModal({ cert, onClose, ...p }) {
  const st = cert.status;

  const print = () => {
    if (cert.local_record) p.log("CERTIFICATE_DOWNLOADED", cert.local_record.id, cert.reference);
    setTimeout(() => window.print(), 60);
  };

  return (
    <Modal
      title="Certificat"
      onClose={onClose}
      wide
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Fermer</button>
          <button className="vz-btn vz-btn-primary" onClick={print}>Enregistrer en PDF</button>
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
      <div className="vz-cert vz-printarea">
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
            <QRCode value={p.verifyUrl(cert)} size={74} quiet={2} />
            <div className="vz-mono" style={{ fontSize: 8.5, color: "var(--gris)", marginTop: 4 }}>certify.vizdata.ci/verify</div>
          </div>
        </div>
      </div>
      <p className="vz-small vz-muted" style={{ marginTop: 12 }}>
        « Enregistrer en PDF » ouvre la boîte d'impression du navigateur : choisissez la destination « Enregistrer au format PDF ».
      </p>
    </Modal>
  );
}

export { CertificateModal };
