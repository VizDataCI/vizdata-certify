/* La sécurité du compte : mot de passe et validation en deux étapes.
 *
 * Pourquoi cet écran vit à part des deux espaces
 * ----------------------------------------------
 * Le mot de passe et le second facteur ne sont pas affaire de titulaire ni
 * d'administrateur : ce sont les clés du COMPTE, et tout compte en a. L'écran
 * habitait l'espace du certifié, et l'administration n'avait qu'un lien vers
 * lui — « Ma sécurité » faisait donc sortir l'administrateur de son espace et
 * l'envoyait sur /espace, c'est-à-dire sur l'espace certifié, avec sa barre,
 * son titre et son adresse. Cliquer sur une entrée de la configuration pour
 * atterrir ailleurs se lit comme une erreur, et c'en était une.
 *
 * Le même écran sert donc aux deux, chacun dans sa propre coquille : l'adresse
 * ne change pas, le menu reste celui où l'on a cliqué.
 */

import { useState } from "react";
import { changePassword, isAuthConfigured, qualiteMotDePasse } from "../../lib/auth.js";
import { DoubleFacteurCarte } from "../certified/DoubleFacteur.jsx";
import { Field } from "../../ui/primitives.jsx";

function EcranSecurite({ p }) {
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [fait, setFait] = useState(false);

  const changer = async () => {
    if (busy) return;
    const souci = qualiteMotDePasse(nouveau);
    if (souci) { setErr(souci); return; }
    if (nouveau !== confirmation) { setErr("Les deux mots de passe ne correspondent pas."); return; }

    setBusy(true);
    setErr("");
    try {
      await changePassword(p.session.email, ancien, nouveau);
      setFait(true);
      setAncien(""); setNouveau(""); setConfirmation("");
      p.notify("Mot de passe modifié.");
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <div className="vz-page-head"><h1>Sécurité</h1></div>
      <div className="vz-card" style={{ maxWidth: 560 }}>
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Mot de passe</h3></div>
        <div className="vz-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {fait && <div className="vz-alert ok">Votre mot de passe a été modifié. Il est actif dès maintenant.</div>}
          {!isAuthConfigured && (
            <div className="vz-alert warn">
              Registre de démonstration : aucun mot de passe n'est réellement enregistré.
            </div>
          )}
          {/* Le mot de passe actuel est exigé, ici comme au serveur, qui le
              revérifie : sans ce contrôle, un poste laissé déverrouillé une
              minute suffirait à prendre le compte. */}
          <Field label="Mot de passe actuel">
            <input className="vz-input" type="password" value={ancien} onChange={(e) => { setAncien(e.target.value); setErr(""); setFait(false); }} autoComplete="current-password" />
          </Field>
          <Field label="Nouveau mot de passe" hint="Huit caractères au minimum, dont une lettre et un chiffre.">
            <input className="vz-input" type="password" value={nouveau} onChange={(e) => { setNouveau(e.target.value); setErr(""); }} autoComplete="new-password" />
          </Field>
          <Field label="Confirmer le nouveau mot de passe">
            <input className="vz-input" type="password" value={confirmation} onChange={(e) => { setConfirmation(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && changer()} autoComplete="new-password" />
          </Field>
          {err && <div className="vz-alert err">{err}</div>}
          <button className="vz-btn vz-btn-primary vz-btn-form" onClick={changer} disabled={busy}>
            {busy ? "Modification…" : "Modifier mon mot de passe"}
          </button>
          <p className="vz-small vz-muted" style={{ lineHeight: 1.7, borderTop: "1px solid var(--trait)", paddingTop: 14, margin: 0 }}>
            Mot de passe perdu ? Déconnectez-vous et utilisez « Mot de passe oublié » sur la page de
            connexion : un lien valable une heure vous sera envoyé.
          </p>
        </div>
      </div>

      <DoubleFacteurCarte notify={p.notify} />
    </>
  );
}

export { EcranSecurite };
