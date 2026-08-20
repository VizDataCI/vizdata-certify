/* Fiche détaillée d'un certificat. */

import { effectiveStatus } from "../../lib/certificates.js";
import { fmtShort } from "../../lib/dates.js";
import { QRCode } from "../../ui/QRCode.jsx";
import { Badge, Modal } from "../../ui/primitives.jsx";

function CertificateDetail({ cert, onClose, setModal, ...p }) {
  const u = p.userOf(cert);
  const t = p.typeOf(cert);
  const st = effectiveStatus(cert);
  const verifs = p.db.verifications.filter((v) => v.certificate_id === cert.id);
  const shares = p.db.shares.filter((s) => s.certificate_id === cert.id);

  return (
    <Modal
      title={cert.reference}
      onClose={onClose}
      wide
      foot={
        <>
          <button className="vz-btn" onClick={() => setModal({ type: "share", c: cert })}>Partager</button>
          <button className="vz-btn" onClick={() => setModal({ type: "cert", c: cert })}>Voir le certificat</button>
          <button className="vz-btn vz-btn-primary" onClick={() => setModal({ type: "form", c: cert })}>Modifier</button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 300px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 16 }}>{t.name}</h3>
            <Badge status={st} />
          </div>
          <dl className="vz-dl" style={{ border: "1px solid var(--trait)", borderRadius: 7 }}>
            <div className="vz-dl-row" style={{ padding: "10px 14px" }}><dt>Titulaire</dt><dd>{u.first_name} {u.last_name}</dd></div>
            <div className="vz-dl-row" style={{ padding: "10px 14px" }}><dt>E-mail</dt><dd className="vz-small">{u.email}</dd></div>
            <div className="vz-dl-row" style={{ padding: "10px 14px" }}><dt>Émission</dt><dd className="vz-mono vz-small">{fmtShort(cert.issue_date)}</dd></div>
            <div className="vz-dl-row" style={{ padding: "10px 14px" }}><dt>Expiration</dt><dd className="vz-mono vz-small">{cert.expiry_date ? fmtShort(cert.expiry_date) : "—"}</dd></div>
            <div className="vz-dl-row" style={{ padding: "10px 14px" }}><dt>Score</dt><dd className="vz-mono vz-small">{cert.score ?? "—"}</dd></div>
            <div className="vz-dl-row" style={{ padding: "10px 14px" }}><dt>Durée</dt><dd className="vz-mono vz-small">{cert.duration} h</dd></div>
            <div className="vz-dl-row" style={{ padding: "10px 14px" }}><dt>Formateur</dt><dd className="vz-small">{cert.trainer}</dd></div>
            <div className="vz-dl-row" style={{ padding: "10px 14px", borderBottom: 0 }}><dt>Signataire</dt><dd className="vz-small">{cert.signatory}</dd></div>
          </dl>
          <div style={{ display: "flex", gap: 18, marginTop: 16 }}>
            <div><div className="vz-eyebrow">Vérifications</div><div className="vz-mono" style={{ fontSize: 20, fontWeight: 600, marginTop: 5 }}>{verifs.length}</div></div>
            <div><div className="vz-eyebrow">Partages</div><div className="vz-mono" style={{ fontSize: 20, fontWeight: 600, marginTop: 5 }}>{shares.length}</div></div>
          </div>
        </div>

        <div style={{ flex: "0 0 190px" }}>
          <div className="vz-eyebrow" style={{ marginBottom: 9 }}>QR code</div>
          <QRCode value={p.verifyUrl(cert)} size={168} quiet={2} />
          <div className="vz-mono" style={{ fontSize: 10, color: "var(--gris)", marginTop: 9, wordBreak: "break-all" }}>{p.verifyUrl(cert)}</div>
          <button className="vz-btn vz-btn-sm" style={{ marginTop: 10 }} onClick={() => { try { navigator.clipboard.writeText(p.verifyUrl(cert)); p.notify("Lien copié."); } catch (e) {} }}>Copier le lien</button>
        </div>
      </div>
    </Modal>
  );
}

export { CertificateDetail };
