/* Notifications envoyées.
 *
 * Pourquoi un écran pour cela
 * ---------------------------
 * Un envoi d'e-mail échoue silencieusement : quota atteint, domaine non
 * vérifié, fournisseur non configuré. Sans trace, VIZDATA croit avoir prévenu
 * un titulaire qui n'a jamais rien reçu, et personne ne s'en aperçoit avant
 * qu'il ne se plaigne.
 *
 * Chaque tentative laisse donc une ligne dans `notifications`, avec son
 * verdict. Les envois en attente (faute de fournisseur configuré) sont
 * visibles ici plutôt que perdus : l'attribution d'un certificat ne doit pas
 * échouer parce qu'un e-mail n'a pas pu partir, mais elle ne doit pas non plus
 * faire croire que l'avis est arrivé.
 */

import { useState } from "react";
import { fmtShort } from "../../lib/dates.js";
import { Stat, Vide } from "../../ui/primitives.jsx";
import { IconeValider, IconeHeure, IconeErreur, IconeNotifications, IconeFiltrer } from "../../ui/icones.jsx";

const GENRES = {
  INVITATION: "Invitation",
  CERTIFICAT_ATTRIBUE: "Certification attribuée",
  MOT_DE_PASSE: "Mot de passe",
  PROFIL_MODIFIE: "Profil modifié",
};

const ETATS = {
  SENT: { label: "Envoyée", tone: "vert" },
  PENDING: { label: "En attente", tone: "orange" },
  FAILED: { label: "Échec", tone: "rouge" },
};

function AdminNotifications(p) {
  const [etat, setEtat] = useState("");
  const [genre, setGenre] = useState("");

  const toutes = p.db.notifications || [];
  const lignes = toutes
    .filter((n) => !etat || n.status === etat)
    .filter((n) => !genre || n.kind === genre);

  const compte = (s) => toutes.filter((n) => n.status === s).length;
  const enSouffrance = compte("PENDING") + compte("FAILED");

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Courrier</div>
          <h1 style={{ marginTop: 8 }}>Notifications</h1>
          <p>Tous les courriers partis du registre, et ceux qui n'ont pas pu partir.</p>
        </div>
      </div>

      {enSouffrance > 0 && (
        <div className="vz-alert warn" style={{ marginBottom: 16 }}>
          <span>
            {enSouffrance} notification{enSouffrance > 1 ? "s n'ont" : " n'a"} pas été remise{enSouffrance > 1 ? "s" : ""}.
            Les certifications concernées sont bien délivrées et visibles dans l'espace de leurs titulaires :
            seul l'avis par courrier a manqué. Vérifiez le fournisseur d'envoi
            (<span className="vz-mono vz-small">RESEND_API_KEY</span>) et le domaine de l'expéditeur.
          </span>
        </div>
      )}

      <div className="vz-grid vz-stats" style={{ marginBottom: 16 }}>
        <Stat label="Envoyées" value={compte("SENT")} sub="Remises au fournisseur" icone={IconeValider} ton="vert" />
        <Stat label="En attente" value={compte("PENDING")} sub="Aucun fournisseur configuré" icone={IconeHeure} ton="orange" />
        <Stat label="Échecs" value={compte("FAILED")} sub="Refusées à l'envoi" icone={IconeErreur} ton="rouge" />
      </div>

      <div className="vz-card">
        <div className="vz-card-head" style={{ gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="vz-select" style={{ width: "auto" }} value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">Tous les types</option>
              {Object.keys(GENRES).map((k) => <option key={k} value={k}>{GENRES[k]}</option>)}
            </select>
            <select className="vz-select" style={{ width: "auto" }} value={etat} onChange={(e) => setEtat(e.target.value)}>
              <option value="">Tous les états</option>
              {Object.keys(ETATS).map((k) => <option key={k} value={k}>{ETATS[k].label}</option>)}
            </select>
          </div>
        </div>
        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead><tr><th>Date</th><th>Destinataire</th><th>Type</th><th>Objet</th><th>État</th></tr></thead>
            <tbody>
              {lignes.map((n) => {
                const e = ETATS[n.status] || { label: n.status, tone: "gris" };
                return (
                  <tr key={n.id}>
                    <td className="vz-mono vz-small vz-muted" style={{ whiteSpace: "nowrap" }}>{fmtShort(n.created_at)}</td>
                    <td className="vz-small">{n.recipient}</td>
                    <td className="vz-small">{GENRES[n.kind] || n.kind}</td>
                    <td className="vz-small vz-muted" style={{ maxWidth: 280 }}>
                      {n.subject}
                      {n.error && <div className="vz-small" style={{ color: "var(--rouge)", marginTop: 3 }}>{n.error}</div>}
                    </td>
                    <td><span className={"vz-badge " + e.tone}>{e.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {lignes.length === 0 && (
          toutes.length === 0 ? (
            <Vide icone={IconeNotifications} titre="Aucun courrier envoyé">
              Les invitations, réinitialisations et avis d'attribution apparaîtront ici, avec le
              verdict de leur remise.
            </Vide>
          ) : (
            <Vide icone={IconeFiltrer} titre="Aucune notification ne correspond">
              Changez le type ou l'état recherché.
            </Vide>
          )
        )}
      </div>
    </>
  );
}

export { AdminNotifications };
