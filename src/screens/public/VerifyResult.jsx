/* Verdict de vérification : la page qui fait foi.

   Deux entrées : soit la référence vient d'être résolue et le certificat est
   passé dans la route, soit on arrive par un jeton public (QR code, lien) et
   il faut interroger le registre.

   Le statut affiché est celui que rend la source — la base pour Supabase,
   `effectiveStatus` pour le registre local. Il n'est jamais recalculé ici. */

import { useState, useEffect } from "react";
import { STATUS_META } from "../../lib/certificates.js";
import { fmtLong } from "../../lib/dates.js";
import { CertificateModal } from "../../modals/CertificateModal.jsx";
import { ShareModal } from "../../modals/ShareModal.jsx";
import { QRCode } from "../../ui/QRCode.jsx";
import { Badge } from "../../ui/primitives.jsx";
import { PublicShell } from "./PublicShell.jsx";

const HEADINGS = {
  ACTIVE: ["Certificat authentique", "Ce certificat est enregistré au registre VIZDATA et il est valide."],
  EXPIRED: ["Certificat expiré", "Ce certificat est authentique, mais sa période de validité est arrivée à son terme."],
  REVOKED: ["Certificat révoqué", "Ce certificat a été révoqué par VIZDATA. Il ne constitue plus une preuve de certification."],
  CANCELLED: ["Certificat annulé", "Ce certificat a été annulé par VIZDATA et n'est plus en vigueur."],
};

const ICONS = { ACTIVE: "✓", EXPIRED: "!", REVOKED: "✕", CANCELLED: "—" };
const TONES = { vert: "var(--vert)", orange: "var(--orange)", rouge: "var(--rouge)", gris: "var(--gris)" };

/** Encart de verdict, utilisé aussi pour les cas d'échec. */
function Verdict({ p, tone, icon, title, text, children }) {
  return (
    <PublicShell {...p}>
      <div className="vz-public-body">
        <div className="vz-slip" style={{ maxWidth: 480 }}>
          <div className="vz-verdict" style={{ borderBottom: 0 }}>
            <div className="vz-verdict-icon" style={{ background: tone }}>{icon}</div>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </PublicShell>
  );
}

function VerifyResult(p) {
  const [cert, setCert] = useState(p.route.certificate || null);
  const [state, setState] = useState(p.route.certificate ? "ready" : "loading");
  const [err, setErr] = useState("");
  const [showCert, setShowCert] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (p.route.certificate) return;
    let alive = true;
    p.findByToken(p.route.token, p.route.source || "qr")
      .then((c) => {
        if (!alive) return;
        setCert(c);
        setState(c ? "ready" : "absent");
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e.message);
        setState("error");
      });
    return () => { alive = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  if (state === "loading") {
    return <Verdict p={p} tone="var(--gris)" icon="…" title="Vérification en cours" text="Interrogation du registre VIZDATA." />;
  }

  if (state === "error") {
    return (
      <Verdict p={p} tone="var(--orange)" icon="!" title="Vérification impossible" text={err}>
        <div className="vz-slip-actions">
          <button className="vz-btn" onClick={() => p.go({ view: "verify" })}>Vérifier par référence</button>
        </div>
      </Verdict>
    );
  }

  if (state === "absent") {
    return (
      <Verdict p={p} tone="var(--gris)" icon="?" title="Certificat introuvable" text="Ce lien ne correspond à aucun certificat du registre VIZDATA.">
        <div className="vz-slip-actions">
          <button className="vz-btn" onClick={() => p.go({ view: "verify" })}>Vérifier par référence</button>
        </div>
      </Verdict>
    );
  }

  const st = cert.status;
  const meta = STATUS_META[st];
  const heading = HEADINGS[st];
  const url = cert.public_token ? p.verifyUrl(cert) : null;
  /* Depuis que les fonctions renvoient la durée, le formateur et le signataire,
     le certificat imprimable se reconstitue aussi depuis le chemin public. */
  const full = Boolean(cert.trainer && cert.signatory);

  return (
    <PublicShell {...p}>
      <div className="vz-public-body">
        <div className="vz-slip">
          <div className="vz-verdict">
            <div className="vz-verdict-icon" style={{ background: TONES[meta.tone] }}>{ICONS[st]}</div>
            <div>
              <h2>{heading[0]}</h2>
              <p>{heading[1]}</p>
            </div>
          </div>

          <div className="vz-refblock">
            <div className="vz-eyebrow">Référence du certificat</div>
            <div className="vz-bigref">{cert.reference}</div>
          </div>

          <dl className="vz-dl">
            <div className="vz-dl-row"><dt>Titulaire</dt><dd>{cert.holder_name}</dd></div>
            <div className="vz-dl-row"><dt>Certification</dt><dd>{cert.certification}</dd></div>
            <div className="vz-dl-row"><dt>Organisme émetteur</dt><dd>{cert.issuer || "VIZDATA"}</dd></div>
            <div className="vz-dl-row"><dt>Date d'émission</dt><dd>{fmtLong(cert.issue_date)}</dd></div>
            <div className="vz-dl-row"><dt>Date d'expiration</dt><dd>{cert.expiry_date ? fmtLong(cert.expiry_date) : "Sans expiration"}</dd></div>
            {st !== "REVOKED" && st !== "CANCELLED" && cert.score != null && (
              <div className="vz-dl-row"><dt>Score obtenu</dt><dd className="vz-mono">{cert.score} / 100</dd></div>
            )}
            <div className="vz-dl-row"><dt>Statut</dt><dd><Badge status={st} /></dd></div>
          </dl>

          {cert.revoke_reason && st === "REVOKED" && (
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--trait)" }}>
              <div className="vz-alert err">Ce certificat a été révoqué par VIZDATA. Motif : {cert.revoke_reason}</div>
            </div>
          )}

          {st === "ACTIVE" && cert.skills?.length > 0 && (
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--trait)" }}>
              <div className="vz-eyebrow" style={{ marginBottom: 9 }}>Compétences validées</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {cert.skills.map((s) => <span key={s} className="vz-chip">{s}</span>)}
              </div>
            </div>
          )}

          {(full || url) && (
            <div className="vz-slip-actions">
              {full && <button className="vz-btn vz-btn-primary" onClick={() => setShowCert(true)}>Consulter le certificat</button>}
              {full && <button className="vz-btn" onClick={() => setShowCert(true)}>Télécharger le PDF</button>}
              {url && <button className="vz-btn" onClick={() => setShareOpen(true)}>Partager</button>}
            </div>
          )}

          <div className="vz-slip-foot">
            Ce certificat a été délivré par VIZDATA. Son authenticité peut être vérifiée à tout moment à partir de cette page.
            {url && (
              <div style={{ marginTop: 10, display: "flex", gap: 14, alignItems: "center" }}>
                <QRCode value={url} size={62} quiet={2} />
                <span className="vz-mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{url}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCert && full && <CertificateModal cert={cert} {...p} onClose={() => setShowCert(false)} />}
      {shareOpen && url && <ShareModal cert={cert} {...p} onClose={() => setShareOpen(false)} />}
    </PublicShell>
  );
}

export { VerifyResult };
