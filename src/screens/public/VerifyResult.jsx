/* Verdict de vérification : la page qui fait foi.
 *
 * Deux entrées : soit la référence vient d'être résolue et le certificat est
 * passé dans la route, soit on arrive par un jeton public (QR code, lien) et
 * il faut interroger le registre.
 *
 * Le statut affiché est celui que rend la source. Il n'est jamais recalculé
 * ici : la page qui fait foi ne décide de rien, elle rapporte.
 *
 * Ce que cette page doit réussir en trois secondes
 * ------------------------------------------------
 * Un employeur arrive ici depuis un QR code, sur un téléphone, entre deux
 * rendez-vous. Il cherche une seule chose : ce document est-il vrai. Le verdict
 * est donc en haut, en grand, avec une couleur qui se lit avant le texte. Tout
 * le reste vient après, dans l'ordre où l'on se pose les questions : qui, quoi,
 * quand, délivré par qui.
 *
 * La valorisation vient en dernier, et seulement pour un certificat en vigueur.
 * Vanter la compétence attestée par un certificat révoqué serait malhonnête.
 */

import { useState, useEffect } from "react";
import { STATUS_META } from "../../lib/certificates.js";
import { fmtLong } from "../../lib/dates.js";
import { CertificateModal } from "../../modals/CertificateModal.jsx";
import { QRCode } from "../../ui/QRCode.jsx";
import { Badge } from "../../ui/primitives.jsx";
import {
  IconeAuthentique, IconeAlerte, IconeRevoquer, IconeInfo, IconeValider,
  IconeDocument, IconeRecherche, IconeHeure,
} from "../../ui/icones.jsx";
import { PublicShell } from "./PublicShell.jsx";

const HEADINGS = {
  ACTIVE: ["Certificat authentique", "Ce certificat est enregistré au registre VIZDATA et il est valide."],
  EXPIRED: ["Certificat expiré", "Ce certificat est authentique, mais sa période de validité est arrivée à son terme."],
  REVOKED: ["Certificat révoqué", "Ce certificat a été révoqué par VIZDATA. Il ne constitue plus une preuve de certification."],
  CANCELLED: ["Certificat annulé", "Ce certificat a été annulé par VIZDATA et n'est plus en vigueur."],
};

/* Une icône plutôt qu'un caractère : un glyphe typographique change de dessin
   d'une police à l'autre, et la croix de la révocation finissait par ressembler
   à une fermeture de fenêtre. */
const ICONES = { ACTIVE: IconeAuthentique, EXPIRED: IconeHeure, REVOKED: IconeRevoquer, CANCELLED: IconeInfo };
const FONDS = { vert: "var(--vert)", orange: "var(--orange)", rouge: "var(--rouge)", gris: "var(--gris)" };
const AMBIANCE = { vert: "ok", rouge: "ko", orange: "attente", gris: "" };

/** Encart de verdict, utilisé aussi pour les cas d'échec. */
function Verdict({ p, tone, icone: Icone, title, text, ambiance = "", children }) {
  return (
    <PublicShell {...p}>
      <div className="vz-public-body">
        <div className="vz-slip" style={{ maxWidth: 500 }}>
          <div className={"vz-verdict " + ambiance} style={{ borderBottom: children ? null : 0 }}>
            <div className="vz-verdict-icon" style={{ background: tone }}><Icone size={23} /></div>
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
    return (
      <Verdict
        p={p} tone="var(--gris)" icone={IconeRecherche}
        title="Vérification en cours" text="Interrogation du registre VIZDATA."
      />
    );
  }

  if (state === "error") {
    return (
      <Verdict p={p} tone="var(--orange)" icone={IconeAlerte} ambiance="attente" title="Vérification impossible" text={err}>
        <div className="vz-slip-actions">
          <button className="vz-btn" onClick={() => p.go({ view: "verify" })}>
            <IconeRecherche size={16} /> Vérifier par référence
          </button>
        </div>
      </Verdict>
    );
  }

  if (state === "absent") {
    return (
      <Verdict
        p={p} tone="var(--gris)" icone={IconeInfo}
        title="Certificat introuvable"
        text="Ce lien ne correspond à aucun certificat du registre VIZDATA."
      >
        <div className="vz-slip-actions">
          <button className="vz-btn" onClick={() => p.go({ view: "verify" })}>
            <IconeRecherche size={16} /> Vérifier par référence
          </button>
        </div>
      </Verdict>
    );
  }

  const st = cert.status;
  const meta = STATUS_META[st];
  const heading = HEADINGS[st];
  const Icone = ICONES[st] || IconeInfo;
  const url = cert.public_token ? p.verifyUrl(cert) : null;
  /* Depuis que les fonctions renvoient la durée, le formateur et le signataire,
     le certificat imprimable se reconstitue aussi depuis le chemin public. */
  const full = Boolean(cert.trainer && cert.signatory);
  const enVigueur = st === "ACTIVE";
  const acquis = Array.isArray(cert.skills) ? cert.skills.filter(Boolean) : [];

  return (
    <PublicShell {...p}>
      <div className="vz-public-body">
        <div className="vz-slip">
          <div className={"vz-verdict " + (AMBIANCE[meta.tone] || "")}>
            <div className="vz-verdict-icon" style={{ background: FONDS[meta.tone] }}><Icone size={23} /></div>
            <div>
              <h2>{heading[0]}</h2>
              <p>{heading[1]}</p>
            </div>
          </div>

          <div className="vz-refblock">
            <div className="vz-eyebrow">Référence du certificat</div>
            <div className="vz-bigref">{cert.reference}</div>
          </div>

          {/* Ce qui est affiché, et rien de plus. Pas de date d'expiration, pas
              de score : ces deux mentions ont quitté le produit, et le registre
              ne les renvoie même plus. Aucune information privée du compte
              n'apparaît ici : ni adresse e-mail, ni téléphone, ni identifiant. */}
          <dl className="vz-dl">
            <div className="vz-dl-row"><dt>Titulaire</dt><dd>{cert.holder_name}</dd></div>
            <div className="vz-dl-row"><dt>Certification</dt><dd>{cert.certification}</dd></div>
            {cert.domain && <div className="vz-dl-row"><dt>Domaine</dt><dd>{cert.domain}</dd></div>}
            <div className="vz-dl-row"><dt>Organisme émetteur</dt><dd>{cert.issuer || "VIZDATA"}</dd></div>
            <div className="vz-dl-row"><dt>Date de délivrance</dt><dd>{fmtLong(cert.issue_date)}</dd></div>
            <div className="vz-dl-row"><dt>Statut d'authenticité</dt><dd><Badge status={st} /></dd></div>
          </dl>

          {cert.revoke_reason && st === "REVOKED" && (
            <div style={{ padding: "18px 26px", borderBottom: "1px solid var(--trait)" }}>
              <div className="vz-alert err">
                <IconeRevoquer size={17} />
                <span>Ce certificat a été révoqué par VIZDATA. Motif : {cert.revoke_reason}</span>
              </div>
            </div>
          )}

          {enVigueur && (
            <>
              <div className="vz-valeur">
                <h3>Une compétence reconnue et valorisée</h3>
                <p>
                  Cette certification atteste que son titulaire a suivi avec succès le parcours de
                  formation correspondant et satisfait aux exigences de validation définies par VIZDATA.
                </p>
                <p>
                  Elle témoigne de sa capacité à mobiliser les compétences acquises dans un contexte
                  professionnel et à les mettre en pratique pour répondre à des situations concrètes.
                </p>
                <p>
                  Elle constitue un élément de valorisation de son parcours et peut être présentée
                  auprès des employeurs, partenaires et recruteurs.
                </p>
              </div>

              {/* Rien n'est déduit ici. Les acquis affichés sont ceux qui ont été
                  rattachés au certificat au moment de la délivrance ; à défaut,
                  la description du programme, écrite par VIZDATA. Sans l'un ni
                  l'autre, la section disparaît. Annoncer des compétences que la
                  formation ne couvre pas ferait de ce registre un argument de
                  vente, ce qu'il n'est pas. */}
              {(acquis.length > 0 || cert.description) && (
                <div className="vz-valeur">
                  <h3>Ce que cette certification atteste</h3>
                  {acquis.length > 0 ? (
                    <ul className="vz-acquis">
                      {acquis.map((s) => (
                        <li key={s}><IconeValider size={16} /><span>{s}</span></li>
                      ))}
                    </ul>
                  ) : (
                    <p>{cert.description}</p>
                  )}
                  {cert.duration > 0 && (
                    <p className="vz-small vz-muted" style={{ marginTop: 14 }}>
                      Parcours de {cert.duration} heures de formation.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Consultation seule. Ni téléchargement ni partage : celui qui vérifie
              constate l'authenticité, il n'a pas à repartir avec l'attestation
              d'autrui. Ces deux actions appartiennent au titulaire, depuis son
              espace, et à VIZDATA depuis l'administration. */}
          {full && (
            <div className="vz-slip-actions">
              <button className="vz-btn vz-btn-primary" onClick={() => setShowCert(true)}>
                <IconeDocument size={16} /> Consulter le certificat
              </button>
            </div>
          )}

          <div className="vz-slip-foot">
            Ce certificat a été délivré par VIZDATA. Son authenticité peut être vérifiée à tout moment
            à partir de cette page.
            {url && (
              <div style={{ marginTop: 12, display: "flex", gap: 15, alignItems: "center" }}>
                <QRCode value={url} size={132} />
                <span className="vz-mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{url}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCert && full && <CertificateModal cert={cert} telechargeable={false} {...p} onClose={() => setShowCert(false)} />}
    </PublicShell>
  );
}

export { VerifyResult };
