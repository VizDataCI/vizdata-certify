/* Connexion. Réelle dès que Supabase est configuré, factice sinon. */

import { useState } from "react";
import { isAuthConfigured, sendPasswordReset } from "../../lib/auth.js";
import { Field } from "../../ui/primitives.jsx";
import { PublicShell } from "./PublicShell.jsx";

function Login(p) {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!email.trim()) { setErr("Entrez votre adresse e-mail."); return; }
    setBusy(true);
    setErr("");
    try {
      await p.login(email, pwd);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const forgotten = async () => {
    if (!isAuthConfigured) {
      p.notify("Un lien de réinitialisation serait envoyé par e-mail.");
      return;
    }
    try {
      await sendPasswordReset(email);
      p.notify("Si un compte existe pour cette adresse, un lien vient d'être envoyé.");
    } catch (e) {
      setErr(e.message);
    }
  };

  const quick = (e) => { setEmail(e); setPwd("demo"); setErr(""); };

  return (
    <PublicShell {...p}>
      <div className="vz-public-body">
        <div className="vz-slip" style={{ maxWidth: 420 }}>
          <div className="vz-card-body" style={{ padding: 26 }}>
            <div className="vz-eyebrow">Accès</div>
            <h2 style={{ fontSize: 19, margin: "10px 0 18px" }}>Se connecter</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <Field label="Adresse e-mail">
                <input className="vz-input" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="vous@exemple.ci" autoComplete="username" />
              </Field>
              <Field label="Mot de passe">
                <input className="vz-input" type="password" value={pwd} onChange={(e) => { setPwd(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} autoComplete="current-password" />
              </Field>
              {err && <div className="vz-alert err">{err}</div>}
              <button className="vz-btn vz-btn-primary vz-btn-lg" onClick={submit} disabled={busy}>
                {busy ? "Connexion…" : "Se connecter"}
              </button>
              <button className="vz-linkbtn" style={{ alignSelf: "center" }} onClick={forgotten}>Mot de passe oublié</button>
            </div>
          </div>
          {!isAuthConfigured && (
            <div className="vz-slip-foot">
              <div className="vz-eyebrow" style={{ marginBottom: 8 }}>Comptes de démonstration</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <button className="vz-btn vz-btn-sm" onClick={() => quick("admin@vizdata.ci")}>Administrateur</button>
                <button className="vz-btn vz-btn-sm" onClick={() => quick("fabrice.boh@vizdata.ci")}>Certifié</button>
              </div>
              <p style={{ marginTop: 9 }}>Le mot de passe est libre en démonstration.</p>
            </div>
          )}
        </div>
      </div>
    </PublicShell>
  );
}

export { Login };
