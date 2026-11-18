/* Fiche d'un certifié : qui il est, et tout ce que VIZDATA lui a délivré.
 *
 * Pourquoi une fiche plutôt qu'une ligne de tableau
 * -------------------------------------------------
 * Le tableau répond à « qui est dans le registre ». Il ne répond pas à « que
 * s'est-il passé pour cette personne », qui est la question posée quand elle
 * appelle. La fiche rassemble donc en un seul endroit ses coordonnées, l'état
 * de son compte et l'historique complet de ses certifications, de la plus
 * récente à la plus ancienne.
 *
 * Tout vient du registre déjà chargé : aucune requête supplémentaire, et donc
 * aucune attente à l'ouverture.
 */

import { effectiveStatus } from "../../lib/certificates.js";
import { fmtLong, fmtShort } from "../../lib/dates.js";
import { peut } from "../../lib/permissions.js";
import { Badge, Modal, Vide } from "../../ui/primitives.jsx";
import {
  IconeCourriel, IconeTelephone, IconeDate, IconeCertificats, IconeModifier,
  IconePlus, IconeVoir, IconeDocument, IconeLien, IconeVerrou,
} from "../../ui/icones.jsx";

/** Initiales, pour la pastille d'entête. */
const initiales = (u) =>
  ((u.first_name || "")[0] || "" + (u.last_name || "")[0] || "").toUpperCase() +
  ((u.last_name || "")[0] || "").toUpperCase();

function HolderDetail({ titulaire: u, onClose, ...p }) {
  const certs = (p.db.certificates || [])
    .filter((c) => String(c.user_id) === String(u.id))
    .sort((a, b) => new Date(b.issue_date) - new Date(a.issue_date));

  const enVigueur = certs.filter((c) => effectiveStatus(c) === "ACTIVE").length;
  const peutAttribuer = peut(p.session, "attribuer_certificats");

  const etatCompte = u.account_status === "DISABLED"
    ? { tone: "rouge", label: "Compte désactivé", aide: "Ce compte ne peut plus se connecter. Ses certificats restent vérifiables." }
    : u.must_change_password
      ? { tone: "orange", label: "Invitation en attente", aide: "Le titulaire n'a pas encore choisi son mot de passe." }
      : { tone: "vert", label: "Compte actif", aide: "Le titulaire peut consulter et partager ses certifications." };

  return (
    <Modal title="Fiche du certifié" onClose={onClose} wide>
      <div className="vz-fiche-tete">
        <div className="vz-avatar violet" style={{ width: 52, height: 52, flex: "0 0 52px", fontSize: 17 }}>
          {initiales(u)}
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 21 }}>{u.first_name} {u.last_name}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
            <span className={"vz-badge " + etatCompte.tone}>{etatCompte.label}</span>
            {u.public_profile && u.username && (
              <button
                className="vz-chip vz-chip-bascule"
                onClick={() => p.go({ view: "publicProfile", username: u.username })}
              >
                <IconeLien size={13} /> <span className="vz-mono">/u/{u.username}</span>
              </button>
            )}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {peutAttribuer && (
            <button className="vz-btn vz-btn-accent vz-btn-sm" onClick={() => p.setModal({ type: "form", c: null, titulaire: u })}>
              <IconePlus size={15} /> Attribuer
            </button>
          )}
          <button className="vz-btn vz-btn-sm" onClick={() => p.setModal({ type: "holder", c: u })}>
            <IconeModifier size={15} /> Modifier
          </button>
        </div>
      </div>

      <p className="vz-small vz-muted" style={{ margin: "10px 0 20px", lineHeight: 1.6 }}>{etatCompte.aide}</p>

      <div className="vz-fiche-infos">
        <Info icone={IconeCourriel} label="Adresse e-mail" valeur={u.email} />
        <Info icone={IconeTelephone} label="Téléphone" valeur={u.phone || "Non renseigné"} />
        <Info icone={IconeDate} label="Compte créé le" valeur={u.created_at ? fmtLong(u.created_at) : "Inconnu"} />
        <Info
          icone={IconeVerrou}
          label="Dernière connexion"
          valeur={u.last_login_at ? fmtLong(u.last_login_at) : "Jamais connecté"}
        />
      </div>

      <div className="vz-card" style={{ marginTop: 22 }}>
        <div className="vz-card-head">
          <h3>Certifications délivrées</h3>
          <span className="vz-small vz-muted">
            {certs.length} au total{certs.length > 0 ? `, ${enVigueur} en vigueur` : ""}
          </span>
        </div>
        {certs.length === 0 ? (
          <Vide
            icone={IconeCertificats}
            titre="Aucune certification"
            action={peutAttribuer && (
              <button className="vz-btn vz-btn-accent vz-btn-sm" onClick={() => p.setModal({ type: "form", c: null, titulaire: u })}>
                <IconePlus size={15} /> Attribuer une certification
              </button>
            )}
          >
            Ce titulaire est enregistré, mais rien ne lui a encore été délivré.
          </Vide>
        ) : (
          <div className="vz-tablewrap">
            <table className="vz-table">
              <thead>
                <tr><th>Référence</th><th>Certification</th><th>Délivré le</th><th>Statut</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {certs.map((c) => {
                  const t = p.typeOf(c);
                  return (
                    <tr key={c.id}>
                      <td className="vz-ref" style={{ color: "var(--bleu)", whiteSpace: "nowrap" }}>{c.reference}</td>
                      <td>
                        {t.name}
                        {p.domainOf(t)?.name && <div className="vz-small vz-muted">{p.domainOf(t).name}</div>}
                      </td>
                      <td className="vz-nums vz-small" style={{ whiteSpace: "nowrap" }}>{fmtShort(c.issue_date)}</td>
                      <td><Badge status={effectiveStatus(c)} /></td>
                      <td>
                        <div className="vz-rowactions">
                          <button className="vz-linkbtn" title="Voir la fiche" onClick={() => p.setModal({ type: "detail", c })}>
                            <IconeVoir size={15} />
                          </button>
                          <button className="vz-linkbtn" title="Voir le certificat" onClick={() => p.setModal({ type: "cert", c })}>
                            <IconeDocument size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Info({ icone: Icone, label, valeur }) {
  return (
    <div className="vz-info">
      <span className="vz-info-icone"><Icone size={16} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="vz-small vz-muted">{label}</div>
        <div style={{ fontWeight: 500, wordBreak: "break-word" }}>{valeur}</div>
      </div>
    </div>
  );
}

export { HolderDetail };
