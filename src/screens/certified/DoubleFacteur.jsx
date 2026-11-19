/* Validation en deux étapes, côté écran.
 *
 * Quatre états, et un seul à la fois : on ne montre jamais le QR code et les
 * codes de secours ensemble. Chaque étape doit pouvoir être finie avant que la
 * suivante ne s'ouvre, parce qu'une personne qui scanne un QR code a son
 * téléphone en main et pas la tête à recopier dix codes.
 *
 *   inactif  → l'explication et le bouton d'activation
 *   scan     → le QR code, le secret recopiable, le premier code à saisir
 *   codes    → les codes de secours, montrés UNE fois
 *   actif    → l'état, le renouvellement des codes, la désactivation
 *
 * Les codes de secours ne sont jamais remontrés : le serveur ne les conserve
 * que hachés. Le dire à l'écran évite qu'on les ferme en pensant les retrouver.
 */

import { useEffect, useState } from "react";
import {
  isAuthConfigured, lireDoubleFacteur, preparerDoubleFacteur, activerDoubleFacteur,
  desactiverDoubleFacteur, renouvelerCodesSecours,
} from "../../lib/auth.js";
import { QRCode } from "../../ui/QRCode.jsx";
import { Field } from "../../ui/primitives.jsx";
import { IconeVerrou, IconeAuthentique, IconeAlerte, IconeCopier } from "../../ui/icones.jsx";

function DoubleFacteurCarte({ notify }) {
  const [etat, setEtat] = useState(null);
  const [vue, setVue] = useState("chargement");
  const [prep, setPrep] = useState(null);
  const [codes, setCodes] = useState(null);
  const [code, setCode] = useState("");
  const [mdp, setMdp] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    let vivant = true;
    lireDoubleFacteur()
      .then((e) => { if (vivant) { setEtat(e); setVue(e.actif ? "actif" : "inactif"); } })
      .catch((e) => { if (vivant) { setErr(e.message); setVue("inactif"); } });
    return () => { vivant = false; };
  }, []);

  const recharger = async () => {
    const e = await lireDoubleFacteur();
    setEtat(e);
    return e;
  };

  const commencer = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      setPrep(await preparerDoubleFacteur());
      setCode("");
      setVue("scan");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const confirmer = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await activerDoubleFacteur(code);
      setCodes(r.codes);
      setVue("codes");
      await recharger();
      notify?.("Validation en deux étapes activée.");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const renouveler = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await renouvelerCodesSecours(mdp);
      setCodes(r.codes);
      setMdp("");
      setVue("codes");
      await recharger();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const desactiver = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      await desactiverDoubleFacteur(mdp);
      setMdp("");
      setPrep(null);
      setCodes(null);
      setVue("inactif");
      await recharger();
      notify?.("Validation en deux étapes désactivée.");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const copier = async () => {
    try {
      await navigator.clipboard.writeText((codes || []).join("\n"));
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      /* Le presse-papiers est refusé hors contexte sécurisé, et dans certains
         navigateurs sans geste direct. Les codes restent lisibles à l'écran :
         l'échec n'empêche rien, il ne doit donc rien afficher d'alarmant. */
      setErr("Copie impossible dans ce navigateur. Recopiez les codes à la main.");
    }
  };

  /* En démonstration il n'y a pas de serveur pour garder un secret : annoncer
     une protection qui n'existe pas serait pire que de ne rien proposer. */
  if (!isAuthConfigured) {
    return (
      <section className="vz-card" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Validation en deux étapes</h3></div>
        <div className="vz-card-body">
          <p className="vz-small vz-muted" style={{ margin: 0, lineHeight: 1.7 }}>
            Indisponible en démonstration : aucun secret n'est conservé par le registre local.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="vz-card" style={{ maxWidth: 560, marginTop: 16 }}>
      <div className="vz-card-head">
        <div>
          <h3 style={{ fontSize: 14 }}>Validation en deux étapes</h3>
          <p className="vz-small vz-muted" style={{ marginTop: 3 }}>
            Un code à six chiffres, en plus du mot de passe, à chaque connexion.
          </p>
        </div>
        {etat?.actif && <span className="vz-badge vert">Active</span>}
      </div>

      <div className="vz-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div className="vz-alert err"><IconeAlerte size={17} /><span>{err}</span></div>}

        {vue === "chargement" && <p className="vz-small vz-muted" style={{ margin: 0 }}>Lecture de l'état…</p>}

        {vue === "inactif" && (
          <>
            <p className="vz-small vz-muted" style={{ margin: 0, lineHeight: 1.7 }}>
              Un mot de passe se devine, se réutilise d'un service à l'autre, se lit par-dessus une
              épaule. Le second facteur ajoute une preuve qu'un attaquant à distance n'a pas : votre
              téléphone. Fonctionne avec Google Authenticator, Microsoft Authenticator, Authy,
              1Password, Bitwarden et toute application compatible.
            </p>
            <button className="vz-btn vz-btn-primary vz-btn-form" onClick={commencer} disabled={busy}>
              <IconeVerrou size={16} /> {busy ? "Préparation…" : "Activer"}
            </button>
          </>
        )}

        {vue === "scan" && prep && (
          <>
            <p className="vz-small vz-muted" style={{ margin: 0, lineHeight: 1.7 }}>
              Ouvrez votre application d'authentification, ajoutez un compte, et scannez ce code.
            </p>
            <div className="vz-2fa-qr"><QRCode value={prep.uri} size={188} /></div>
            <div>
              <div className="vz-label" style={{ marginBottom: 6 }}>Ou saisissez cette clé à la main</div>
              <div className="vz-2fa-secret">{prep.secret.match(/.{1,4}/g).join(" ")}</div>
            </div>
            <Field label="Code affiché par l'application">
              <input
                className="vz-input vz-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => { setCode(e.target.value); setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && confirmer()}
              />
            </Field>
            <button className="vz-btn vz-btn-primary vz-btn-form" onClick={confirmer} disabled={busy || code.trim().length < 6}>
              {busy ? "Vérification…" : "Confirmer l'activation"}
            </button>
            <button className="vz-linkbtn" style={{ alignSelf: "center" }} onClick={() => { setVue("inactif"); setErr(""); }}>
              Annuler
            </button>
          </>
        )}

        {vue === "codes" && codes && (
          <>
            <div className="vz-alert ok"><IconeAuthentique size={17} /><span>Vos codes de secours. Ils ne seront plus affichés.</span></div>
            <p className="vz-small vz-muted" style={{ margin: 0, lineHeight: 1.7 }}>
              Chacun ne sert qu'une fois, et remplace le code à six chiffres si vous perdez votre
              téléphone. Notez-les ailleurs que sur ce téléphone.
            </p>
            <div className="vz-2fa-codes">
              {codes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="vz-btn vz-btn-sm" onClick={copier}>
                <IconeCopier size={15} /> {copie ? "Copiés" : "Copier les codes"}
              </button>
              <button className="vz-btn vz-btn-sm vz-btn-primary" onClick={() => { setCodes(null); setVue("actif"); }}>
                J'ai noté ces codes
              </button>
            </div>
          </>
        )}

        {vue === "actif" && (
          <>
            <p className="vz-small vz-muted" style={{ margin: 0, lineHeight: 1.7 }}>
              Votre compte demande un code à chaque connexion.{" "}
              {etat?.codes_restants > 0
                ? `Il vous reste ${etat.codes_restants} code${etat.codes_restants > 1 ? "s" : ""} de secours.`
                : "Vous n'avez plus de code de secours : renouvelez-les."}
            </p>
            <Field label="Mot de passe" hint="Exigé pour renouveler les codes ou désactiver la protection.">
              <input
                className="vz-input"
                type="password"
                value={mdp}
                onChange={(e) => { setMdp(e.target.value); setErr(""); }}
                autoComplete="current-password"
              />
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="vz-btn" onClick={renouveler} disabled={busy || !mdp}>
                Renouveler les codes de secours
              </button>
              <button className="vz-btn vz-btn-danger" onClick={desactiver} disabled={busy || !mdp}>
                Désactiver
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export { DoubleFacteurCarte };
