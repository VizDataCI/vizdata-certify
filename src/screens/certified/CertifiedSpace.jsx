/* Espace du titulaire : certificats, profil, paramètres.

   Les certificats sont demandés sans filtre sur le titulaire : la politique
   certificates_owner_select s'en charge. Ce qui arrive ici est donc déjà ce que
   le compte connecté a le droit de voir. */

import { useState, useEffect } from "react";
import { AppShell } from "../../ui/AppShell.jsx";
import { Badge, Field } from "../../ui/primitives.jsx";
import { CertificateModal } from "../../modals/CertificateModal.jsx";
import { ShareModal } from "../../modals/ShareModal.jsx";
import { fmtLong, fmtShort } from "../../lib/dates.js";

function CertifiedSpace(p) {
  const [page, setPage] = useState("certs");
  const [modal, setModal] = useState(null);
  const [me, setMe] = useState(p.session);
  const [certs, setCerts] = useState(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!p.session) return;
    let alive = true;
    p.myCertificates()
      .then((rows) => { if (alive) setCerts(rows); })
      .catch((e) => { if (alive) { setErr(e.message); setCerts([]); } });
    return () => { alive = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [p.session]);

  if (!p.session) { p.go({ view: "login" }); return null; }

  const saveProfile = async () => {
    setSaving(true);
    setErr("");
    try {
      await p.saveProfile({
        first_name: me.first_name,
        last_name: me.last_name,
        linkedin_url: me.linkedin_url,
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
    { key: "certs", label: "Mes certificats" },
    { key: "profile", label: "Mon profil" },
    { key: "settings", label: "Paramètres" },
  ];

  return (
    <AppShell nav={nav} current={page} onNav={setPage} session={p.session} go={p.go} logout={p.logout} title="Espace certifié" sub="CERTIFY">
      <div className="vz-page">
        {page === "certs" && (
          <>
            <div className="vz-page-head">
              <div>
                <div className="vz-eyebrow">Bonjour {p.session.first_name}</div>
                <h1 style={{ marginTop: 8 }}>Mes certificats</h1>
              </div>
              {certs && <span className="vz-chip">{certs.length} certificat{certs.length > 1 ? "s" : ""}</span>}
            </div>

            {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}

            {certs === null ? (
              <div className="vz-card"><div className="vz-empty">Chargement de vos certificats…</div></div>
            ) : (
              <>
                <div className="vz-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(292px,1fr))" }}>
                  {certs.map((c) => (
                    <div key={c.reference} className="vz-card">
                      <div className="vz-card-body">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                          <h3 style={{ fontSize: 15 }}>{c.certification}</h3>
                          <Badge status={c.status} />
                        </div>
                        <div className="vz-ref vz-small" style={{ color: "var(--bleu)", marginTop: 10 }}>{c.reference}</div>
                        <div className="vz-small vz-muted" style={{ marginTop: 6 }}>
                          Émis le {fmtLong(c.issue_date)}{c.expiry_date ? ` · valable jusqu'au ${fmtShort(c.expiry_date)}` : " · sans expiration"}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
                          <button className="vz-btn vz-btn-sm" onClick={() => p.go({ view: "verifyResult", token: c.public_token, source: "lien" })}>Voir</button>
                          <button className="vz-btn vz-btn-sm" onClick={() => setModal({ type: "cert", c })}>Télécharger</button>
                          <button className="vz-btn vz-btn-sm" onClick={() => setModal({ type: "share", c })}>Partager</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {certs.length === 0 && <div className="vz-card"><div className="vz-empty">Aucun certificat n'est encore rattaché à ce compte.</div></div>}
              </>
            )}
          </>
        )}

        {page === "profile" && (
          <>
            <div className="vz-page-head"><h1>Mon profil</h1></div>
            <div className="vz-card" style={{ maxWidth: 620 }}>
              <div className="vz-card-body">
                <div className="vz-form-grid">
                  <Field label="Prénom"><input className="vz-input" value={me.first_name} onChange={(e) => setMe({ ...me, first_name: e.target.value })} /></Field>
                  <Field label="Nom"><input className="vz-input" value={me.last_name} onChange={(e) => setMe({ ...me, last_name: e.target.value })} /></Field>
                  <Field label="Adresse e-mail" hint="L'adresse identifie le compte : elle se change depuis l'authentification.">
                    <input className="vz-input" value={me.email} readOnly style={{ background: "var(--surface)" }} />
                  </Field>
                  <Field label="Profil LinkedIn"><input className="vz-input" value={me.linkedin_url || ""} onChange={(e) => setMe({ ...me, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/…" /></Field>
                </div>
                <div style={{ marginTop: 18, borderTop: "1px solid var(--trait)", paddingTop: 16 }}>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" checked={me.public_profile} onChange={(e) => setMe({ ...me, public_profile: e.target.checked })} style={{ marginTop: 3 }} />
                    <span>
                      <span className="vz-label">Afficher mon profil publiquement</span>
                      <span className="vz-small vz-muted" style={{ display: "block", marginTop: 3 }}>
                        Adresse publique : <span className="vz-mono">/u/{me.username}</span> — seules les certifications en vigueur y apparaissent.
                      </span>
                    </span>
                  </label>
                </div>
                {err && <div className="vz-alert err" style={{ marginTop: 14 }}>{err}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <button className="vz-btn vz-btn-primary" onClick={saveProfile} disabled={saving}>
                    {saving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  {me.public_profile && <button className="vz-btn" onClick={() => p.go({ view: "publicProfile", username: me.username })}>Voir mon profil public</button>}
                </div>
              </div>
            </div>
          </>
        )}

        {page === "settings" && (
          <>
            <div className="vz-page-head"><h1>Paramètres</h1></div>
            <div className="vz-card" style={{ maxWidth: 620 }}>
              <div className="vz-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Mot de passe"><button className="vz-btn" style={{ alignSelf: "flex-start" }} onClick={() => p.notify("Un lien de changement de mot de passe serait envoyé par e-mail.")}>Changer mon mot de passe</button></Field>
                <Field label="Notifications">
                  <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
                    <input type="checkbox" defaultChecked /> <span className="vz-small">M'avertir avant l'expiration d'un certificat</span>
                  </label>
                </Field>
              </div>
            </div>
          </>
        )}
      </div>

      {modal?.type === "cert" && <CertificateModal cert={modal.c} {...p} onClose={() => setModal(null)} />}
      {modal?.type === "share" && <ShareModal cert={modal.c} {...p} onClose={() => setModal(null)} />}
    </AppShell>
  );
}

export { CertifiedSpace };
