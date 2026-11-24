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
import { STATUS_META, typeCertificat } from "../../lib/certificates.js";
import { fmtLong } from "../../lib/dates.js";
import { CertificateModal } from "../../modals/CertificateModal.jsx";
import { QRCode } from "../../ui/QRCode.jsx";
import { VizdataMark } from "../../ui/VizdataLogo.jsx";
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
            {/* Ce que le certificat atteste : la participation au programme, ou
                la validation des compétences qu'il enseigne. Celui qui vérifie
                a besoin de la distinction — c'est la question même qu'il pose. */}
            <div className="vz-dl-row"><dt>Type de certificat</dt><dd>{typeCertificat(cert.kind).label}</dd></div>
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

          {/* Une seule section, et courte.
              Trois paragraphes de valorisation tenaient ici, suivis d'un second
              encart pour les acquis : l'essentiel passait sous la ligne de
              flottaison, et celui qui vérifie faisait défiler pour rien. La
              phrase qui engage VIZDATA est gardée, le reste est parti.

              Rien n'est déduit. Les acquis affichés sont ceux rattachés au
              certificat au moment de la délivrance ; à défaut, la description
              du programme, écrite par VIZDATA. Annoncer des compétences que la
              formation ne couvre pas ferait de ce registre un argument de
              vente, ce qu'il n'est pas. */}
          {enVigueur && (
            <div className="vz-valeur">
              <h3>Ce que ce certificat atteste</h3>
              {/* Deux documents, deux affirmations. Écrire « satisfait aux
                  exigences de validation » sous un certificat de participation
                  ferait dire au registre l'inverse de ce que porte le document
                  — et c'est ici, pas ailleurs, qu'un employeur vient lire. */}
              {typeCertificat(cert.kind).competences ? (
                <p>
                  Son titulaire a suivi le parcours de formation VIZDATA correspondant et satisfait aux
                  exigences de validation. Il peut être présenté à un employeur ou à un recruteur.
                </p>
              ) : (
                <p>
                  Son titulaire a participé au parcours de formation VIZDATA correspondant. Ce certificat
                  atteste sa participation effective : il ne porte pas de validation de compétences.
                </p>
              )}
              {acquis.length > 0 ? (
                <ul className="vz-acquis">
                  {acquis.map((s) => (
                    <li key={s}><IconeValider size={16} /><span>{s}</span></li>
                  ))}
                </ul>
              ) : (
                cert.description && <p style={{ marginTop: 10 }}>{cert.description}</p>
              )}
              {cert.duration > 0 && (
                <p className="vz-small vz-muted" style={{ marginTop: 12 }}>
                  Parcours de {cert.duration} heures de formation.
                </p>
              )}
            </div>
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

          {/* Pied signé : la marque, la phrase qui dit d'où vient le document,
              et le QR code à côté plutôt qu'en dessous. Empilés, ils ajoutaient
              une hauteur d'écran sur un téléphone. */}
          <div className="vz-slip-foot vz-foot-signe">
            <div className="vz-foot-marque">
              <VizdataMark size={22} />
              <span>Délivré par VIZDATA. Vérifiable à tout moment depuis cette page.</span>
            </div>
            {url && (
              <div className="vz-foot-qr">
                <QRCode value={url} size={92} />
                <span className="vz-mono">{url}</span>
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
