/* Annuaire des certifiés.
 *
 * C'est d'ici qu'on crée un titulaire, qu'on consulte sa fiche, qu'on corrige
 * ses informations et qu'on lui attribue une certification. L'attribution part
 * du titulaire choisi : le formulaire s'ouvre avec lui déjà désigné, ce qui
 * évite de le rechercher une seconde fois.
 *
 * La ligne entière ouvre la fiche. Les actions de la dernière colonne arrêtent
 * la propagation du clic : sans cela, « Modifier » ouvrirait les deux.
 */

import { useState } from "react";
import { effectiveStatus } from "../../lib/certificates.js";
import { fmtShort } from "../../lib/dates.js";
import { peut } from "../../lib/permissions.js";
import { Vide } from "../../ui/primitives.jsx";
import { IconePlus, IconeCertifies, IconeModifier, IconeRecherche, IconeVoir } from "../../ui/icones.jsx";

function AdminCertified(p) {
  const [q, setQ] = useState("");
  const [etat, setEtat] = useState("");

  const tous = (p.db.users || []).filter((u) => u.role === "CERTIFIED");
  const titulaires = tous
    .filter((u) => (etat === "" ? true : etat === "disabled" ? u.account_status === "DISABLED" : etat === "pending" ? u.must_change_password : u.account_status !== "DISABLED"))
    .filter((u) => `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  const peutCreer = peut(p.session, "creer_titulaires");
  const peutAttribuer = peut(p.session, "attribuer_certificats");
  const filtreActif = Boolean(q || etat);

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Titulaires</div>
          <h1 style={{ marginTop: 8 }}>Certifiés</h1>
          <p>
            Les personnes à qui VIZDATA a ouvert un espace. Un compte se désactive, il ne se supprime
            pas : ses certificats délivrés doivent rester vérifiables.
          </p>
        </div>
        {peutCreer && (
          <button className="vz-btn vz-btn-accent" onClick={() => p.setModal({ type: "holder", c: null })}>
            <IconePlus size={16} /> Nouveau certifié
          </button>
        )}
      </div>

      <div className="vz-card">
        <div className="vz-card-head vz-filtres">
          <input
            className="vz-input vz-search"
            style={{ maxWidth: 320 }}
            placeholder="Nom, prénom ou adresse e-mail"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Rechercher un certifié"
          />
          <select className="vz-select" style={{ width: "auto" }} value={etat} onChange={(e) => setEtat(e.target.value)} aria-label="État du compte">
            <option value="">Tous les comptes</option>
            <option value="active">Comptes actifs</option>
            <option value="pending">Invitation en attente</option>
            <option value="disabled">Comptes désactivés</option>
          </select>
          <span className="vz-small vz-muted" style={{ marginLeft: "auto" }}>
            {titulaires.length} sur {tous.length}
          </span>
        </div>

        {titulaires.length === 0 ? (
          filtreActif ? (
            <Vide
              icone={IconeRecherche}
              titre="Aucun certifié ne correspond"
              action={<button className="vz-btn vz-btn-sm" onClick={() => { setQ(""); setEtat(""); }}>Effacer la recherche</button>}
            >
              Essayez avec un nom partiel, ou changez le filtre sur l'état du compte.
            </Vide>
          ) : (
            <Vide
              icone={IconeCertifies}
              titre="Aucun certifié enregistré"
              action={peutCreer && (
                <button className="vz-btn vz-btn-accent vz-btn-sm" onClick={() => p.setModal({ type: "holder", c: null })}>
                  <IconePlus size={15} /> Créer le premier
                </button>
              )}
            >
              Créer un titulaire lui ouvre un espace personnel et lui envoie un lien d'activation.
              Aucun mot de passe n'est jamais envoyé en clair.
            </Vide>
          )
        ) : (
          <div className="vz-tablewrap">
            <table className="vz-table">
              <thead>
                <tr>
                  <th>Nom</th><th>E-mail</th><th>Certifications</th><th>Compte</th><th>Profil public</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {titulaires.map((u) => {
                  const cs = p.db.certificates.filter((c) => c.user_id === u.id);
                  const act = cs.filter((c) => effectiveStatus(c) === "ACTIVE").length;
                  return (
                    <tr key={u.id} style={{ cursor: "pointer" }} onClick={() => p.setModal({ type: "titulaire", c: u })}>
                      <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                        {u.first_name} {u.last_name}
                        {u.invited_at && u.must_change_password && (
                          <div className="vz-small vz-muted" style={{ fontWeight: 400 }}>Invité le {fmtShort(u.invited_at)}</div>
                        )}
                      </td>
                      <td className="vz-small vz-muted">{u.email}</td>
                      <td className="vz-small vz-nums">
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
                          ? (
                            <button
                              className="vz-linkbtn vz-mono"
                              style={{ padding: 0 }}
                              onClick={(e) => { e.stopPropagation(); p.go({ view: "publicProfile", username: u.username }); }}
                            >
                              /u/{u.username}
                            </button>
                          )
                          : <span className="vz-muted">Désactivé</span>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="vz-rowactions">
                          <button className="vz-linkbtn" title="Ouvrir la fiche" onClick={() => p.setModal({ type: "titulaire", c: u })}>
                            <IconeVoir size={15} />
                          </button>
                          {peutAttribuer && (
                            <button className="vz-linkbtn" title="Attribuer une certification" onClick={() => p.setModal({ type: "form", c: null, titulaire: u })}>
                              <IconePlus size={15} />
                            </button>
                          )}
                          <button className="vz-linkbtn" title="Modifier le compte" onClick={() => p.setModal({ type: "holder", c: u })}>
                            <IconeModifier size={15} />
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
    </>
  );
}

export { AdminCertified };
