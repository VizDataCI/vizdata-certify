/* Fiche détaillée d'un certificat — ce que l'administration en sait.
 *
 * C'est le seul endroit où la date d'expiration et le score restent visibles,
 * et seulement s'ils sont renseignés : ces deux mentions ont quitté le produit,
 * mais les certificats anciens en portent, et un registre ne réécrit pas ce
 * qu'il a délivré. Elles sont donc présentées comme ce qu'elles sont devenues —
 * des mentions d'archive.
 */

import { effectiveStatus } from "../../lib/certificates.js";
import { fmtLong, fmtShort } from "../../lib/dates.js";
import { peut } from "../../lib/permissions.js";
import { QRCode } from "../../ui/QRCode.jsx";
import { Badge, Modal } from "../../ui/primitives.jsx";

function CertificateDetail({ cert, onClose, setModal, ...p }) {
  const u = p.userOf(cert);
  const t = p.typeOf(cert);
  const d = p.domainOf(t);
  const st = effectiveStatus(cert);
  const url = p.verifyUrl(cert);

  const verifs = p.db.verifications.filter((v) => v.certificate_id === cert.id);
  const partages = (p.db.shares || []).filter((s) => s.certificate_id === cert.id);
  const emetteur = (p.db.users || []).find((x) => x.id === cert.issued_by);
  const archive = cert.expiry_date || cert.score != null;

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(url);
      p.notify("Lien de vérification copié.");
    } catch (e) {
      p.notify("La copie n'a pas abouti. Sélectionnez le lien à la main.");
    }
  };

  return (
    <Modal
      title={cert.reference}
      onClose={onClose}
      wide
      foot={
        <>
          {peut(p.session, "revoquer_certificats") && st !== "REVOKED" && (
            <button className="vz-btn vz-btn-danger" onClick={() => setModal({ type: "revoke", c: cert })}>Révoquer</button>
          )}
          <button className="vz-btn" onClick={() => setModal({ type: "share", c: cert })}>Partager</button>
          <button className="vz-btn" onClick={() => setModal({ type: "cert", c: cert })}>Voir le certificat</button>
          {peut(p.session, "attribuer_certificats") && (
            <button className="vz-btn vz-btn-primary" onClick={() => setModal({ type: "form", c: cert })}>Modifier</button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: 16 }}>{t.name}</h3>
              {d && <div className="vz-small vz-muted" style={{ marginTop: 3 }}>{d.name} · <span className="vz-mono">{t.code}</span></div>}
            </div>
            <Badge status={st} />
          </div>

          <dl className="vz-dl" style={{ border: "1px solid var(--trait)", borderRadius: 8 }}>
            <Rang dt="Certifié" dd={`${u.first_name} ${u.last_name}`} />
            <Rang dt="Adresse e-mail" dd={u.email} petit />
            <Rang dt="Délivré le" dd={fmtLong(cert.issue_date)} />
            <Rang dt="Durée" dd={cert.duration ? `${cert.duration} heures` : "Non précisée"} mono />
            <Rang dt="Formateur" dd={cert.trainer || "Non précisé"} petit />
            <Rang dt="Signataire" dd={cert.signatory || "Non précisé"} petit />
            <Rang dt="Attribué par" dd={emetteur ? `${emetteur.first_name} ${emetteur.last_name}` : "Inconnu"} petit />
            <Rang dt="Enregistré le" dd={cert.created_at ? fmtShort(cert.created_at) : "Inconnue"} mono dernier />
          </dl>

          {st === "REVOKED" && cert.revoke_reason && (
            <div className="vz-alert err" style={{ marginTop: 14 }}>
              Motif de révocation, affiché publiquement : {cert.revoke_reason}
            </div>
          )}

          {archive && (
            <div className="vz-alert warn" style={{ marginTop: 14 }}>
              <span>
                <strong>Mentions d'archive.</strong> Ce certificat porte des informations que le registre
                n'utilise plus et qui n'apparaissent nulle part : ni sur le document, ni dans l'espace du
                titulaire, ni publiquement :
                {cert.expiry_date ? ` expiration au ${fmtShort(cert.expiry_date)}` : ""}
                {cert.expiry_date && cert.score != null ? " ;" : ""}
                {cert.score != null ? ` score de ${cert.score}/100` : ""}.
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: 22, marginTop: 18 }}>
            <div>
              <div className="vz-eyebrow">Vérifications</div>
              <div className="vz-mono" style={{ fontSize: 21, fontWeight: 600, marginTop: 5 }}>{verifs.length}</div>
            </div>
            <div>
              <div className="vz-eyebrow">Partages</div>
              <div className="vz-mono" style={{ fontSize: 21, fontWeight: 600, marginTop: 5 }}>{partages.length}</div>
            </div>
            {verifs.length > 0 && (
              <div>
                <div className="vz-eyebrow">Dernière vérification</div>
                <div className="vz-small" style={{ marginTop: 8 }}>{fmtShort(verifs[0].verified_at)}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: "0 0 196px" }}>
          <div className="vz-eyebrow" style={{ marginBottom: 9 }}>QR code de vérification</div>
          <QRCode value={url} size={172} />
          <div className="vz-mono" style={{ fontSize: 10, color: "var(--gris)", marginTop: 9, wordBreak: "break-all", lineHeight: 1.5 }}>{url}</div>
          <button className="vz-btn vz-btn-sm" style={{ marginTop: 10 }} onClick={copier}>Copier le lien</button>
        </div>
      </div>
    </Modal>
  );
}

function Rang({ dt, dd, mono, petit, dernier }) {
  const classes = ["vz-dl-row"];
  return (
    <div className={classes.join(" ")} style={{ padding: "10px 15px", borderBottom: dernier ? 0 : undefined }}>
      <dt>{dt}</dt>
      <dd className={(mono ? "vz-mono " : "") + (petit || mono ? "vz-small" : "")} style={{ wordBreak: "break-word" }}>{dd}</dd>
    </div>
  );
}

export { CertificateDetail };
