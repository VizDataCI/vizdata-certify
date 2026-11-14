/* Création et modification d'un titulaire.
 *
 * Création
 * --------
 * Un titulaire ne peut pas exister sans compte d'authentification :
 * `public.users.id` référence `auth.users(id)`. Créer ce compte demande la clé
 * secrète du projet, qui n'a rien à faire dans un navigateur — elle contourne
 * toutes les politiques RLS. La création passe donc par la fonction Edge
 * `inviter-titulaire`, qui détient la clé et vérifie elle-même l'autorisation
 * de l'appelant.
 *
 * Aucun mot de passe n'est produit ni envoyé. Le titulaire reçoit un lien
 * signé et choisit son mot de passe lui-même : c'est la seule façon qu'aucun
 * secret ne circule par courrier.
 *
 * Si l'adresse est déjà connue, le compte existant est réutilisé. Un doublon
 * donnerait deux espaces personnels à la même personne, dont un vide.
 *
 * Modification
 * ------------
 * L'adresse e-mail n'est modifiable que par un administrateur, et le
 * déclencheur `guard_user_privileges` le fait respecter côté base : un
 * gestionnaire qui tenterait l'écriture par appel REST direct serait refusé.
 */

import { useState } from "react";
import { estAdmin } from "../../lib/permissions.js";
import { Field, Modal } from "../../ui/primitives.jsx";

function HolderForm({ titulaire, onClose, ...p }) {
  const nouveau = !titulaire;
  const admin = estAdmin(p.session);

  const [f, setF] = useState(() =>
    titulaire
      ? {
          first_name: titulaire.first_name || "",
          last_name: titulaire.last_name || "",
          email: titulaire.email || "",
          phone: titulaire.phone || "",
          linkedin_url: titulaire.linkedin_url || "",
          public_profile: Boolean(titulaire.public_profile),
        }
      : { first_name: "", last_name: "", email: "", phone: "", linkedin_url: "", public_profile: false }
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState(null);

  const valider = () => {
    if (!f.first_name.trim() || !f.last_name.trim()) return "Le prénom et le nom sont obligatoires.";
    if (!f.email.trim()) return "L'adresse e-mail est obligatoire.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return "L'adresse e-mail n'est pas valide.";
    return "";
  };

  const enregistrer = async () => {
    if (busy) return;
    const souci = valider();
    if (souci) { setErr(souci); return; }

    setBusy(true);
    setErr("");
    try {
      if (nouveau) {
        const r = await p.actions.inviterTitulaire({
          email: f.email,
          first_name: f.first_name,
          last_name: f.last_name,
          phone: f.phone,
        });
        setResultat(r);
        setBusy(false);
        return;
      }

      const champs = {
        first_name: f.first_name.trim(),
        last_name: f.last_name.trim(),
        phone: f.phone || null,
        linkedin_url: f.linkedin_url || "",
        public_profile: f.public_profile,
      };
      await p.actions.majTitulaire(titulaire, champs);
      if (admin && f.email.trim().toLowerCase() !== (titulaire.email || "").toLowerCase()) {
        await p.actions.changerEmail(titulaire, f.email);
      }
      p.notify("Titulaire mis à jour.");
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  /* --- compte rendu de la création -------------------------------------- */
  if (resultat) {
    const t = resultat.titulaire;
    return (
      <Modal
        title="Titulaire enregistré"
        onClose={onClose}
        foot={<button className="vz-btn vz-btn-primary" onClick={onClose}>Terminer</button>}
      >
        {resultat.existe ? (
          <div className="vz-alert info">
            <span>
              <strong>{t.first_name} {t.last_name}</strong> était déjà enregistré au registre.
              Son compte existant est conservé — aucun doublon n'a été créé. Vous pouvez lui attribuer une certification.
            </span>
          </div>
        ) : (
          <div className="vz-alert ok">
            <span>
              <strong>{t.first_name} {t.last_name}</strong> est enregistré, et son compte d'accès est créé.
            </span>
          </div>
        )}

        {!resultat.existe && (
          <p className="vz-small vz-muted" style={{ marginTop: 14, lineHeight: 1.75 }}>
            {resultat.invitation_envoyee
              ? "Une invitation vient de partir vers son adresse. Elle contient un lien sécurisé pour choisir son mot de passe — aucun mot de passe n'a été envoyé en clair."
              : "Le compte est créé, mais l'invitation n'a pas pu être envoyée. Le titulaire peut utiliser « Mot de passe oublié » sur la page de connexion pour accéder à son espace."}
          </p>
        )}

        {resultat.avertissement && (
          <div className="vz-alert warn" style={{ marginTop: 14 }}>{resultat.avertissement}</div>
        )}

        <dl className="vz-dl" style={{ border: "1px solid var(--trait)", borderRadius: 8, marginTop: 16 }}>
          <div className="vz-dl-row" style={{ padding: "11px 15px" }}><dt>Adresse e-mail</dt><dd className="vz-small">{t.email}</dd></div>
          <div className="vz-dl-row" style={{ padding: "11px 15px", borderBottom: 0 }}><dt>Identifiant public</dt><dd className="vz-mono vz-small">/u/{t.username}</dd></div>
        </dl>
      </Modal>
    );
  }

  return (
    <Modal
      title={nouveau ? "Nouveau certifié" : `${titulaire.first_name} ${titulaire.last_name}`}
      onClose={onClose}
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Annuler</button>
          <button className="vz-btn vz-btn-primary" onClick={enregistrer} disabled={busy}>
            {busy ? "Enregistrement…" : nouveau ? "Créer et inviter" : "Enregistrer"}
          </button>
        </>
      }
    >
      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}
      {nouveau && (
        <div className="vz-alert info" style={{ marginBottom: 16 }}>
          Son compte d'accès est créé automatiquement, et une invitation lui est envoyée pour qu'il
          choisisse son mot de passe. Aucun mot de passe n'est transmis par courrier.
        </div>
      )}

      <div className="vz-form-grid">
        <Field label="Prénom">
          <input className="vz-input" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} />
        </Field>
        <Field label="Nom">
          <input className="vz-input" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} />
        </Field>
        <Field
          label="Adresse e-mail"
          hint={nouveau ? "Elle identifiera son compte." : admin ? "Modifiable par un administrateur seulement." : "Seul un administrateur peut la modifier."}
        >
          <input
            className="vz-input"
            type="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
            readOnly={!nouveau && !admin}
            style={!nouveau && !admin ? { background: "var(--surface)" } : null}
          />
        </Field>
        <Field label="Téléphone">
          <input className="vz-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+225 …" />
        </Field>
      </div>

      {!nouveau && (
        <>
          <div style={{ marginTop: 14 }}>
            <Field label="Profil LinkedIn">
              <input className="vz-input" value={f.linkedin_url} onChange={(e) => setF({ ...f, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/…" />
            </Field>
          </div>
          <div style={{ marginTop: 16, borderTop: "1px solid var(--trait)", paddingTop: 15 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" checked={f.public_profile} onChange={(e) => setF({ ...f, public_profile: e.target.checked })} style={{ marginTop: 3 }} />
              <span>
                <span className="vz-label">Profil public activé</span>
                <span className="vz-small vz-muted" style={{ display: "block", marginTop: 3 }}>
                  Adresse : <span className="vz-mono">/u/{titulaire.username}</span>
                </span>
              </span>
            </label>
          </div>
        </>
      )}
    </Modal>
  );
}

export { HolderForm };
