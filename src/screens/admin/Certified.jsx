/* Annuaire des certifiés.
 *
 * C'est d'ici qu'on crée un titulaire, qu'on corrige ses informations et qu'on
 * lui attribue une certification. L'attribution part du titulaire choisi : le
 * formulaire s'ouvre avec lui déjà désigné, ce qui évite de le rechercher.
 */

import { useState } from "react";
import { effectiveStatus } from "../../lib/certificates.js";
import { fmtShort } from "../../lib/dates.js";
import { peut } from "../../lib/permissions.js";

function AdminCertified(p) {
  const [q, setQ] = useState("");
  const [etat, setEtat] = useState("");

  const titulaires = (p.db.users || [])
    .filter((u) => u.role === "CERTIFIED")
    .filter((u) => (etat === "" ? true : etat === "disabled" ? u.account_status === "DISABLED" : etat === "pending" ? u.must_change_password : u.account_status !== "DISABLED"))
    .filter((u) => `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  const peutCreer = peut(p.session, "creer_titulaires");
  const peutAttribuer = peut(p.session, "attribuer_certificats");

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Titulaires</div>
          <h1 style={{ marginTop: 8 }}>Certifiés</h1>
        </div>
        {peutCreer && (
          <button className="vz-btn vz-btn-primary" onClick={() => p.setModal({ type: "holder", c: null })}>+ Nouveau certifié</button>
        )}
      </div>

      <div className="vz-card">
        <div className="vz-card-head" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="vz-input" style={{ maxWidth: 330 }} placeholder="Rechercher un certifié" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="vz-select" style={{ width: "auto" }} value={etat} onChange={(e) => setEtat(e.target.value)}>
            <option value="">Tous les comptes</option>
            <option value="active">Comptes actifs</option>
            <option value="pending">Invitation en attente</option>
            <option value="disabled">Comptes désactivés</option>
          </select>
        </div>
        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead>
              <tr><th>Nom</th><th>E-mail</th><th>Certifications</th><th>Compte</th><th>Profil public</th><th></th></tr>
            </thead>
            <tbody>
              {titulaires.map((u) => {
                const cs = p.db.certificates.filter((c) => c.user_id === u.id);
                const act = cs.filter((c) => effectiveStatus(c) === "ACTIVE").length;
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                      {u.first_name} {u.last_name}
                      {u.invited_at && u.must_change_password && (
                        <div className="vz-small vz-muted" style={{ fontWeight: 400 }}>Invité le {fmtShort(u.invited_at)}</div>
                      )}
                    </td>
                    <td className="vz-small vz-muted">{u.email}</td>
                    <td className="vz-mono vz-small">
                      {cs.length}
                      {cs.length > 0 && <span className="vz-muted"> ({act} en vigueur)</span>}
                    </td>
                    <td>
                      {u.account_status === "DISABLED"
                        ? <span className="vz-badge rouge">Désactivé</span>
                        : u.must_change_password
                        ? <span className="vz-badge orange">En attente</span>
                        : <span className="vz-badge vert">Actif</span>}
                    </td>
                    <td className="vz-small">
                      {u.public_profile
                        ? <button className="vz-linkbtn vz-mono" style={{ padding: 0 }} onClick={() => p.go({ view: "publicProfile", username: u.username })}>/u/{u.username}</button>
                        : <span className="vz-muted">Désactivé</span>}
                    </td>
                    <td>
                      <div className="vz-rowactions">
                        {peutAttribuer && (
                          <button className="vz-linkbtn" onClick={() => p.setModal({ type: "form", c: null, titulaire: u })}>Attribuer</button>
                        )}
                        <button className="vz-linkbtn" onClick={() => p.setModal({ type: "holder", c: u })}>Modifier</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {titulaires.length === 0 && (
          <div className="vz-empty">
            {q || etat ? "Aucun certifié ne correspond à cette recherche." : "Aucun certifié n'est encore enregistré."}
          </div>
        )}
      </div>
      <p className="vz-small vz-muted" style={{ marginTop: 10 }}>
        {titulaires.length} certifié{titulaires.length > 1 ? "s" : ""} affiché{titulaires.length > 1 ? "s" : ""}.
        Un compte se désactive depuis « Utilisateurs & rôles » ; il ne se supprime pas, car ses certificats
        délivrés doivent rester vérifiables.
      </p>
    </>
  );
}

export { AdminCertified };
