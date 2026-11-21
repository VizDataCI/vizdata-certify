/* Espace du titulaire : ses certifications, son profil, sa sécurité.
 *
 * Les certificats sont demandés sans filtre sur le titulaire : la politique
 * `certificates_owner_select` s'en charge. Ce qui arrive ici est donc déjà ce
 * que le compte connecté a le droit de voir — et rien d'autre. Ajouter un
 * filtre côté client laisserait croire que la séparation vient du navigateur.
 *
 * Ni date d'expiration ni score n'apparaissent : un certificat VIZDATA atteste
 * d'un acquis, et la note relève de l'évaluation, pas de l'attestation.
 */

import { useState, useEffect } from "react";
import { changePassword, isAuthConfigured, qualiteMotDePasse } from "../../lib/auth.js";
import { fmtLong } from "../../lib/dates.js";
import { CertificateModal } from "../../modals/CertificateModal.jsx";
import { DoubleFacteurCarte } from "./DoubleFacteur.jsx";
import { ShareModal } from "../../modals/ShareModal.jsx";
import { AppShell } from "../../ui/AppShell.jsx";
import { ZoneImpression, imprimerCertificat } from "../../ui/Certificat.jsx";
import { Badge, Field, Stat, Vide } from "../../ui/primitives.jsx";
import {
  IconeCertificats, IconeAuthentique, IconeCatalogue, IconeDocument,
  IconeTelecharger, IconeImprimer, IconePartager, IconeVerification,
  IconeCertifies, IconeVerrou,
} from "../../ui/icones.jsx";

function CertifiedSpace(p) {
  /* L'onglet peut être demandé par la route : « Mon compte », depuis
     l'administration, ouvre directement la sécurité. */
  const [page, setPage] = useState(() => p.route?.tab || "certs");
  const [modal, setModal] = useState(null);
  const [me, setMe] = useState(p.session);
  const [certs, setCerts] = useState(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  /* Le certificat monté dans la zone d'impression. Il n'y en a qu'un à la
     fois : imprimer depuis une carte ne doit pas ouvrir de modale. */
  const [aSortir, setASortir] = useState(null);

  useEffect(() => {
    if (!p.session) return;
    let alive = true;
    p.myCertificates()
      .then((rows) => { if (alive) setCerts(rows); })
      .catch((e) => { if (alive) { setErr(e.message); setCerts([]); } });
    return () => { alive = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [p.session]);

  /* Le document doit être peint dans la zone d'impression avant que la boîte
     de dialogue ne gèle le rendu : l'ordre est donc « monter, puis imprimer »,
     jamais l'inverse. */
  useEffect(() => {
    if (!aSortir) return;
    imprimerCertificat(aSortir.cert.reference);
    if (aSortir.mode === "pdf") {
      p.notify("Choisissez « Enregistrer au format PDF » comme destination.");
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [aSortir]);

  /* On ne renvoie vers la connexion qu'une fois la session CONNUE. Rediriger
     avant reviendrait à mettre dehors quelqu'un de parfaitement connecté,
     simplement parce que la réponse du serveur n'est pas encore arrivée — ce
     qui arrive à chaque fois qu'on ouvre directement l'adresse de son espace,
     par exemple depuis le lien d'un courrier.
     Le renvoi part d'un effet et non du rendu : changer l'état de App pendant
     qu'il dessine cet écran gagnait parfois la course contre la session qui
     venait de s'ouvrir. */
  const aRenvoyer = p.sessionConnue && !p.session;
  useEffect(() => {
    if (aRenvoyer) p.go({ view: "login" });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [aRenvoyer]);

  if (!p.sessionConnue) return <Patienter texte="Ouverture de votre espace…" />;
  if (!p.session) return null;

  const sortir = (cert, mode) => {
    /* Un nouvel objet à chaque fois, même certificat : l'effet doit se
       redéclencher si l'on réimprime le même document. */
    setASortir({ cert, mode, n: Date.now() });
  };

  const saveProfile = async () => {
    setSaving(true);
    setErr("");
    try {
      await p.saveProfile({
        first_name: me.first_name,
        last_name: me.last_name,
        linkedin_url: me.linkedin_url,
        phone: me.phone,
        public_profile: me.public_profile,
      });
      p.notify("Profil enregistré.");
    } catch (e) {
      setErr(e.message);
    }
    setSaving(false);
  };

  const nav = [
    { group: "Espace certifié" },
    { key: "certs", label: "Mes certifications", icone: IconeCertificats },
    { key: "profile", label: "Mon profil", icone: IconeCertifies },
    { key: "settings", label: "Sécurité", icone: IconeVerrou },
  ];

  const total = certs?.length ?? 0;
  const valides = certs?.filter((c) => c.status === "ACTIVE").length ?? 0;
  const domaines = new Set((certs || []).map((c) => c.domain).filter(Boolean)).size;

  return (
    <AppShell nav={nav} current={page} onNav={setPage} session={p.session} go={p.go} logout={p.logout} title="Espace certifié" sub="CERTIFY">
      <div className="vz-page">
        {page === "certs" && (
          <>
            <div className="vz-welcome">
              <div className="vz-eyebrow">Bienvenue</div>
              <h1>{p.session.first_name} {p.session.last_name}</h1>
              <p>
                {total === 0
                  ? "Aucune certification n'est encore rattachée à votre compte."
                  : `Vous détenez ${total} certification${total > 1 ? "s" : ""} délivrée${total > 1 ? "s" : ""} par VIZDATA.`}
              </p>
            </div>

            {total > 0 && (
              <div className="vz-grid vz-stats" style={{ marginBottom: 22 }}>
                <Stat label="Certifications" value={total} sub="Délivrées par VIZDATA" icone={IconeCertificats} ton="bleu" />
                <Stat label="En vigueur" value={valides} sub="Vérifiables publiquement" icone={IconeAuthentique} ton="vert" />
                <Stat label="Domaines" value={domaines} sub="Champs de compétence" icone={IconeCatalogue} ton="violet" />
              </div>
            )}

            {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}

            {certs === null ? (
              <div className="vz-card"><div className="vz-empty">Chargement de vos certifications…</div></div>
            ) : certs.length === 0 ? (
              <div className="vz-card">
                <Vide icone={IconeCertificats} titre="Aucune certification pour le moment">
                  Vos certifications apparaîtront ici dès que VIZDATA vous en délivrera une. Vous
                  pourrez alors les consulter, les télécharger et les partager.
                </Vide>
              </div>
            ) : (
              <div className="vz-grid vz-cards">
                {certs.map((c) => (
                  <article key={c.reference} className="vz-certcard">
                    <div className="vz-certcard-haut">
                      {c.domain && <span className="vz-certcard-domaine">{c.domain}</span>}
                      <Badge status={c.status} />
                    </div>
                    <h3>{c.certification}</h3>
                    <div className="vz-certcard-ref">{c.reference}</div>
                    <div className="vz-certcard-date">Délivré le {fmtLong(c.issue_date)}</div>

                    {/* Ce que le registre a mesuré au profit du titulaire. Le
                        chiffre existait depuis le début dans la table des
                        vérifications, sans que personne ne le voie. Zéro se dit
                        aussi : « pas encore consulté » est une information, et
                        masquer la ligne laisserait croire à une panne. */}
                    <div className="vz-certcard-vus">
                      <IconeVerification size={14} />
                      {c.verifications > 0
                        ? <span><strong>{c.verifications}</strong> vérification{c.verifications > 1 ? "s" : ""} depuis la délivrance</span>
                        : <span>Pas encore consulté par un tiers</span>}
                    </div>

                    {c.skills?.length > 0 && (
                      <div className="vz-certcard-skills">
                        {c.skills.slice(0, 3).map((s) => <span key={s} className="vz-chip">{s}</span>)}
                        {c.skills.length > 3 && <span className="vz-chip">+{c.skills.length - 3}</span>}
                      </div>
                    )}

                    <div className="vz-certcard-actions">
                      <button className="vz-btn vz-btn-sm vz-btn-primary" onClick={() => setModal({ type: "cert", c })}>
                        <IconeDocument size={15} /> Consulter
                      </button>
                      <button className="vz-btn vz-btn-sm" onClick={() => sortir(c, "pdf")}>
                        <IconeTelecharger size={15} /> PDF
                      </button>
                      <button className="vz-btn vz-btn-sm" onClick={() => sortir(c, "impression")}>
                        <IconeImprimer size={15} /> Imprimer
                      </button>
                    </div>
                    <div className="vz-certcard-liens">
                      <button className="vz-linkbtn" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                        onClick={() => p.go({ view: "verifyResult", token: c.public_token, source: "lien" })}>
                        <IconeVerification size={14} /> Page de vérification
                      </button>
                      <button className="vz-linkbtn" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                        onClick={() => setModal({ type: "share", c })}>
                        <IconePartager size={14} /> Partager
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {page === "profile" && (
          <>
            <div className="vz-page-head"><h1>Mon profil</h1></div>
            <div className="vz-card" style={{ maxWidth: 680 }}>
              <div className="vz-card-body">
                <div className="vz-form-grid">
                  <Field label="Prénom"><input className="vz-input" value={me.first_name || ""} onChange={(e) => setMe({ ...me, first_name: e.target.value })} /></Field>
                  <Field label="Nom"><input className="vz-input" value={me.last_name || ""} onChange={(e) => setMe({ ...me, last_name: e.target.value })} /></Field>
                  {/* L'adresse e-mail identifie le compte. Elle n'est pas
                      modifiable ici, et pas seulement à l'écran : un
                      déclencheur côté base refuse l'écriture à tout autre
                      qu'un administrateur. */}
                  <Field label="Adresse e-mail" hint="L'adresse identifie votre compte. Seul un administrateur VIZDATA peut la modifier.">
                    <input className="vz-input" value={me.email || ""} readOnly style={{ background: "var(--surface)" }} />
                  </Field>
                  <Field label="Téléphone"><input className="vz-input" value={me.phone || ""} onChange={(e) => setMe({ ...me, phone: e.target.value })} placeholder="+225 …" /></Field>
                  <Field label="Profil LinkedIn"><input className="vz-input" value={me.linkedin_url || ""} onChange={(e) => setMe({ ...me, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/…" /></Field>
                </div>
                <div style={{ marginTop: 20, borderTop: "1px solid var(--trait)", paddingTop: 18 }}>
                  <label style={{ display: "flex", gap: 11, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" checked={Boolean(me.public_profile)} onChange={(e) => setMe({ ...me, public_profile: e.target.checked })} style={{ marginTop: 3 }} />
                    <span>
                      <span className="vz-label">Afficher mon profil publiquement</span>
                      <span className="vz-small vz-muted" style={{ display: "block", marginTop: 3, lineHeight: 1.6 }}>
                        Adresse publique : <span className="vz-mono">/u/{me.username}</span>. Seules les certifications en vigueur y apparaissent.
                      </span>
                    </span>
                  </label>
                </div>
                {err && <div className="vz-alert err" style={{ marginTop: 14 }}>{err}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
                  <button className="vz-btn vz-btn-primary" onClick={saveProfile} disabled={saving}>
                    {saving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  {me.public_profile && <button className="vz-btn" onClick={() => p.go({ view: "publicProfile", username: me.username })}>Voir mon profil public</button>}
                </div>
              </div>
            </div>
          </>
        )}

        {page === "settings" && <Securite p={p} />}
      </div>

      {/* Monté hors de toute modale : imprimer depuis une carte n'ouvre rien. */}
      {aSortir && <ZoneImpression key={aSortir.n} cert={aSortir.cert} verifyUrl={p.verifyUrl(aSortir.cert)} />}

      {modal?.type === "cert" && <CertificateModal cert={modal.c} {...p} onClose={() => setModal(null)} />}
      {modal?.type === "share" && <ShareModal cert={modal.c} {...p} onClose={() => setModal(null)} />}
    </AppShell>
  );
}

/** Attente sobre, le temps que le registre dise qui est connecté. */
function Patienter({ texte }) {
  return (
    <div className="vz-public">
      <div className="vz-public-body">
        <div className="vz-slip" style={{ maxWidth: 380 }}>
          <div className="vz-empty">{texte}</div>
        </div>
      </div>
    </div>
  );
}

/* --- sécurité : changement de mot de passe ------------------------------- */

function Securite({ p }) {
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

export { CertifiedSpace };
