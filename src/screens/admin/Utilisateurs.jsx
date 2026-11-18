/* Utilisateurs et rôles.
 *
 * Trois rôles : administrateur, gestionnaire, certifié. Le gestionnaire est le
 * seul dont les droits se règlent ici, une autorisation à la fois — c'est le
 * sens de « selon les autorisations définies par l'administrateur ».
 *
 * Ce que cet écran ne décide pas
 * ------------------------------
 * Rien. Il écrit `users.role` et `users.permissions`, et c'est la base qui en
 * tire les conséquences : les politiques RLS interrogent `has_perm()`, et le
 * déclencheur `guard_user_privileges` refuse à quiconque n'est pas
 * administrateur de modifier un rôle, une autorisation, un statut de compte ou
 * une adresse e-mail — y compris par appel REST direct, hors de toute
 * interface. Décocher une case ici retire donc réellement un droit.
 *
 * Aucune suppression de compte. Désactiver, oui ; supprimer, non : un titulaire
 * porte des certificats délivrés, et la clé étrangère est en RESTRICT. Le
 * registre doit garder trace de ce qu'il a certifié, même pour quelqu'un qui
 * n'a plus accès à son espace.
 */

import { useState } from "react";
import { AUTORISATIONS, ROLES, libelleRole, resumeAutorisations } from "../../lib/permissions.js";
import { Field, Modal, Stat } from "../../ui/primitives.jsx";
import { IconePlus, IconeVerrou, IconeUtilisateurs, IconeCertifies } from "../../ui/icones.jsx";

function AdminUtilisateurs(p) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [modal, setModal] = useState(null);
  const [err, setErr] = useState("");

  const lignes = (p.db.users || [])
    .filter((u) => !role || u.role === role)
    .filter((u) => `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  const compte = (r) => (p.db.users || []).filter((u) => u.role === r).length;

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Accès</div>
          <h1 style={{ marginTop: 8 }}>Utilisateurs et rôles</h1>
          <p>Qui accède au registre, et avec quels droits. Les permissions se règlent compte par compte.</p>
        </div>
        <button className="vz-btn vz-btn-accent" onClick={() => setModal({ type: "nouveau" })}>
          <IconePlus size={16} /> Nouveau compte
        </button>
      </div>

      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="vz-grid vz-stats" style={{ marginBottom: 16 }}>
        <Stat label="Administrateurs" value={compte("ADMIN")} sub="Tous les droits" icone={IconeVerrou} ton="gris" />
        <Stat label="Gestionnaires" value={compte("MANAGER")} sub="Droits accordés un par un" icone={IconeUtilisateurs} ton="violet" />
        <Stat label="Certifiés" value={compte("CERTIFIED")} sub="Espace personnel" icone={IconeCertifies} ton="bleu" />
      </div>

      <div className="vz-card">
        <div className="vz-card-head" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="vz-input vz-search" style={{ maxWidth: 320 }} placeholder="Rechercher un compte" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un compte" />
          <select className="vz-select" style={{ width: "auto" }} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Tous les rôles</option>
            {Object.keys(ROLES).map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
          </select>
        </div>
        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead>
              <tr><th>Nom</th><th>Adresse e-mail</th><th>Rôle</th><th>Autorisations</th><th>Compte</th><th></th></tr>
            </thead>
            <tbody>
              {lignes.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                    {u.first_name} {u.last_name}
                    {u.id === p.session.id && <span className="vz-chip" style={{ marginLeft: 7 }}>vous</span>}
                  </td>
                  <td className="vz-small vz-muted">{u.email}</td>
                  <td>
                    <span className={"vz-badge " + (u.role === "ADMIN" ? "rouge" : u.role === "MANAGER" ? "orange" : "gris")}>
                      {libelleRole(u.role)}
                    </span>
                  </td>
                  <td className="vz-small vz-muted" style={{ maxWidth: 260 }}>{resumeAutorisations(u)}</td>
                  <td>
                    {u.account_status === "DISABLED"
                      ? <span className="vz-badge rouge">Désactivé</span>
                      : u.must_change_password
                      ? <span className="vz-badge orange">Invitation en attente</span>
                      : <span className="vz-badge vert">Actif</span>}
                  </td>
                  <td>
                    <div className="vz-rowactions">
                      <button className="vz-linkbtn" onClick={() => setModal({ type: "role", u })}>Rôle</button>
                      {/* Se désactiver soi-même fermerait la porte de
                          l'intérieur : l'action n'est pas proposée. */}
                      {u.id !== p.session.id && (
                        u.account_status === "DISABLED" ? (
                          <button className="vz-linkbtn" onClick={() => setModal({ type: "statut", u, vers: "ACTIVE" })}>Réactiver</button>
                        ) : (
                          <button className="vz-linkbtn danger" onClick={() => setModal({ type: "statut", u, vers: "DISABLED" })}>Désactiver</button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lignes.length === 0 && <div className="vz-empty">Aucun compte ne correspond à cette recherche.</div>}
      </div>

      {modal?.type === "role" && <FormulaireRole {...p} utilisateur={modal.u} onErreur={setErr} onClose={() => setModal(null)} />}
      {modal?.type === "statut" && <ConfirmationStatut {...p} utilisateur={modal.u} vers={modal.vers} onErreur={setErr} onClose={() => setModal(null)} />}
      {modal?.type === "nouveau" && <FormulaireCompte {...p} onErreur={setErr} onClose={() => setModal(null)} />}
    </>
  );
}

/* --- rôle et autorisations ----------------------------------------------- */

function FormulaireRole({ utilisateur, onClose, ...p }) {
  const [role, setRole] = useState(utilisateur.role);
  const [permissions, setPermissions] = useState(() => ({ ...(utilisateur.permissions || {}) }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const soiMeme = utilisateur.id === p.session.id;

  const enregistrer = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await p.actions.changerRole(utilisateur, role, role === "MANAGER" ? permissions : {});
      p.notify("Rôle mis à jour.");
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Rôle de ${utilisateur.first_name} ${utilisateur.last_name}`}
      onClose={onClose}
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Annuler</button>
          <button className="vz-btn vz-btn-primary" onClick={enregistrer} disabled={busy || soiMeme}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}
      {soiMeme && (
        <div className="vz-alert warn" style={{ marginBottom: 14 }}>
          Vous ne pouvez pas modifier votre propre rôle. Un autre administrateur doit s'en charger :
          sans cette règle, le dernier administrateur pourrait se retirer ses propres droits et verrouiller
          la plateforme.
        </div>
      )}

      <Field label="Rôle">
        <select className="vz-select" value={role} onChange={(e) => setRole(e.target.value)} disabled={soiMeme}>
          {Object.keys(ROLES).map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
        </select>
      </Field>
      <p className="vz-small vz-muted" style={{ marginTop: 8, lineHeight: 1.7 }}>{ROLES[role]?.detail}</p>

      {role === "MANAGER" && (
        <div style={{ marginTop: 20, borderTop: "1px solid var(--trait)", paddingTop: 18 }}>
          <div className="vz-label" style={{ marginBottom: 4 }}>Autorisations accordées</div>
          <p className="vz-small vz-muted" style={{ marginBottom: 14, lineHeight: 1.7 }}>
            Seules les cases cochées sont permises. Le contrôle est tenu par la base : décocher retire
            réellement le droit, y compris hors de cette interface.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {AUTORISATIONS.map((a) => (
              <label key={a.cle} style={{ display: "flex", gap: 11, alignItems: "flex-start", cursor: soiMeme ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={Boolean(permissions[a.cle])}
                  disabled={soiMeme}
                  onChange={(e) => setPermissions({ ...permissions, [a.cle]: e.target.checked })}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span className="vz-label">{a.label}</span>
                  <span className="vz-small vz-muted" style={{ display: "block", marginTop: 2 }}>{a.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {role === "ADMIN" && (
        <div className="vz-alert info" style={{ marginTop: 18 }}>
          Un administrateur dispose de tous les droits, sans configuration : création de comptes,
          attribution, révocation, catalogue et paramètres.
        </div>
      )}
    </Modal>
  );
}

/* --- activation et désactivation ----------------------------------------- */

function ConfirmationStatut({ utilisateur, vers, onClose, ...p }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const desactiver = vers === "DISABLED";

  const confirmer = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await p.actions.changerStatutCompte(utilisateur, vers);
      p.notify(desactiver ? "Compte désactivé." : "Compte réactivé.");
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const certificats = p.db.certificates.filter((c) => c.user_id === utilisateur.id).length;

  return (
    <Modal
      title={desactiver ? "Désactiver ce compte" : "Réactiver ce compte"}
      onClose={onClose}
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Annuler</button>
          <button className={"vz-btn " + (desactiver ? "vz-btn-danger" : "vz-btn-primary")} onClick={confirmer} disabled={busy}>
            {busy ? "…" : desactiver ? "Désactiver" : "Réactiver"}
          </button>
        </>
      }
    >
      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}
      <p style={{ lineHeight: 1.75 }}>
        <strong>{utilisateur.first_name} {utilisateur.last_name}</strong>, {utilisateur.email}
      </p>
      {desactiver ? (
        <div className="vz-alert warn" style={{ marginTop: 14 }}>
          <span>
            Le compte ne pourra plus se connecter. Ses {certificats} certificat{certificats > 1 ? "s" : ""} restent
            enregistrés au registre et demeurent vérifiables publiquement : désactiver un accès n'annule pas
            une certification délivrée. Pour retirer un certificat, il faut le révoquer.
          </span>
        </div>
      ) : (
        <div className="vz-alert info" style={{ marginTop: 14 }}>
          Le compte pourra se reconnecter avec son mot de passe habituel.
        </div>
      )}
    </Modal>
  );
}

/* --- création d'un compte d'administration ------------------------------- */

function FormulaireCompte({ onClose, ...p }) {
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", role: "CERTIFIED" });
  const [permissions, setPermissions] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState(null);

  const creer = async () => {
    if (busy) return;
    if (!f.first_name.trim() || !f.last_name.trim()) { setErr("Le prénom et le nom sont obligatoires."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { setErr("L'adresse e-mail n'est pas valide."); return; }

    setBusy(true);
    setErr("");
    try {
      const r = await p.actions.inviterTitulaire({
        email: f.email,
        first_name: f.first_name,
        last_name: f.last_name,
        role: f.role,
      });
      if (f.role === "MANAGER" && !r.existe) {
        await p.actions.changerRole(r.titulaire, "MANAGER", permissions);
      }
      setResultat(r);
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  if (resultat) {
    return (
      <Modal title="Compte créé" onClose={onClose} foot={<button className="vz-btn vz-btn-primary" onClick={onClose}>Terminer</button>}>
        <div className={"vz-alert " + (resultat.existe ? "info" : "ok")}>
          {resultat.existe
            ? "Un compte existait déjà pour cette adresse : il a été conservé."
            : resultat.invitation_envoyee
            ? "Le compte est créé et l'invitation est partie. La personne choisira son mot de passe elle-même."
            : "Le compte est créé, mais l'invitation n'a pas pu être envoyée. La personne peut passer par « mot de passe oublié »."}
        </div>
        {resultat.avertissement && <div className="vz-alert warn" style={{ marginTop: 14 }}>{resultat.avertissement}</div>}
      </Modal>
    );
  }

  return (
    <Modal
      title="Nouveau compte"
      onClose={onClose}
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Annuler</button>
          <button className="vz-btn vz-btn-primary" onClick={creer} disabled={busy}>{busy ? "Création…" : "Créer et inviter"}</button>
        </>
      }
    >
      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="vz-alert info" style={{ marginBottom: 16 }}>
        Aucun mot de passe n'est envoyé : la personne reçoit un lien sécurisé et choisit le sien.
      </div>
      <div className="vz-form-grid">
        <Field label="Prénom"><input className="vz-input" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
        <Field label="Nom"><input className="vz-input" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
        <Field label="Adresse e-mail"><input className="vz-input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Rôle">
          <select className="vz-select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {Object.keys(ROLES).map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
          </select>
        </Field>
      </div>

      {f.role === "MANAGER" && (
        <div style={{ marginTop: 18, borderTop: "1px solid var(--trait)", paddingTop: 16 }}>
          <div className="vz-label" style={{ marginBottom: 11 }}>Autorisations accordées</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {AUTORISATIONS.map((a) => (
              <label key={a.cle} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={Boolean(permissions[a.cle])} onChange={(e) => setPermissions({ ...permissions, [a.cle]: e.target.checked })} />
                <span className="vz-small">{a.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

export { AdminUtilisateurs };
