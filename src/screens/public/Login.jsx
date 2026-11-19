/* Connexion.
 *
 * Réelle dès que le registre du serveur est joignable, factice en mode
 * démonstration. L'écran ne change pas de forme entre les deux : ce qui se
 * voit ici doit ressembler à ce qu'on verra en production.
 */

import { useState } from "react";
import { isAuthConfigured } from "../../lib/auth.js";
import { Field, EnteteForm } from "../../ui/primitives.jsx";
import { IconeCourriel, IconeErreur, IconeVerrou } from "../../ui/icones.jsx";
import { PublicShell } from "./PublicShell.jsx";

function Login(p) {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  /* Le défi rendu par le serveur quand le compte porte un second facteur.
     Tant qu'il est posé, l'écran demande un code et non un mot de passe. */
  const [defi, setDefi] = useState(null);
  const [code, setCode] = useState("");

  const submit = async () => {
    if (busy) return;
    if (!email.trim()) { setErr("Entrez votre adresse e-mail."); return; }
    setBusy(true);
    setErr("");
    try {
      const suite = await p.login(email, pwd);
      if (suite?.deuxiemeFacteur) {
        setDefi(suite.defi);
        setCode("");
        setBusy(false);
      }
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const envoyerCode = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await p.loginCode(defi, code);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
      /* Un défi expiré ou épuisé ne se rattrape pas : on renvoie au mot de
         passe plutôt que de laisser taper des codes dans le vide. */
      if (/expir|reprenez/i.test(e.message)) { setDefi(null); setPwd(""); }
    }
  };

  const recommencer = () => { setDefi(null); setCode(""); setErr(""); setPwd(""); };

  const quick = (e) => { setEmail(e); setPwd("demo"); setErr(""); };

  return (
    <PublicShell {...p}>
      <div className="vz-public-body">
        <div className="vz-slip" style={{ maxWidth: 440 }}>
          <div className="vz-card-body" style={{ padding: "44px 40px 34px", textAlign: "center" }}>
            {defi ? (
              <>
                <EnteteForm titre="Votre code de vérification">
                  Ouvrez votre application d'authentification et saisissez le code à six chiffres affiché pour VIZDATA CERTIFY.
                </EnteteForm>
                <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                  <input
                    className="vz-input vz-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={13}
                    placeholder="000000"
                    value={code}
                    autoFocus
                    onChange={(e) => { setCode(e.target.value); setErr(""); }}
                    onKeyDown={(e) => e.key === "Enter" && envoyerCode()}
                    aria-label="Code de vérification"
                  />
                  {err && <div className="vz-alert err" style={{ textAlign: "left" }}><IconeErreur size={17} /><span>{err}</span></div>}
                  <button className="vz-btn vz-btn-primary vz-btn-lg" style={{ width: "100%" }} onClick={envoyerCode} disabled={busy}>
                    {busy ? "Vérification…" : <><IconeVerrou size={17} /> Vérifier</>}
                  </button>
                  <p className="vz-small vz-muted" style={{ lineHeight: 1.6, margin: 0 }}>
                    Téléphone perdu ? Entrez l'un de vos codes de secours à la place du code à six chiffres.
                  </p>
                  <button className="vz-linkbtn" style={{ alignSelf: "center" }} onClick={recommencer}>
                    Revenir au mot de passe
                  </button>
                </div>
              </>
            ) : (
              <>
            <EnteteForm titre="Accéder à mon espace">
              Réservé aux certifiés VIZDATA et à l'équipe du registre.
            </EnteteForm>
            <div style={{ display: "flex", flexDirection: "column", gap: 15, textAlign: "left" }}>
              <Field label="Adresse e-mail">
                <input className="vz-input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="vous@exemple.ci" autoComplete="username" />
              </Field>
              <Field label="Mot de passe">
                <input className="vz-input" type="password" value={pwd} onChange={(e) => { setPwd(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} autoComplete="current-password" />
              </Field>
              {err && <div className="vz-alert err"><IconeErreur size={17} /><span>{err}</span></div>}
              <button className="vz-btn vz-btn-primary vz-btn-lg" style={{ width: "100%", marginTop: 4 }} onClick={submit} disabled={busy}>
                {busy ? "Connexion…" : <><IconeCourriel size={17} /> Se connecter</>}
              </button>
              {/* L'oubli du mot de passe a son propre écran : il doit pouvoir
                  dire ce qu'il a fait, et surtout accueillir le retour du lien.
                  Un message fugitif laissait l'utilisateur sans repère, et le
                  lien retombait sur une page sans formulaire. */}
              <button className="vz-linkbtn" style={{ alignSelf: "center" }} onClick={() => p.go({ view: "forgotPassword" })}>Mot de passe oublié</button>
            </div>
              </>
            )}
          </div>
          {!isAuthConfigured && !defi && (
            <div className="vz-slip-foot">
              <div className="vz-eyebrow" style={{ marginBottom: 8 }}>Comptes de démonstration</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <button className="vz-btn vz-btn-sm" onClick={() => quick("admin@vizdata.ci")}>Administrateur</button>
                <button className="vz-btn vz-btn-sm" onClick={() => quick("gestion@vizdata.ci")}>Gestionnaire</button>
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
