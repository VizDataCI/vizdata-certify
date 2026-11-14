/* Tableau de bord — piloter, pas contempler.
 *
 * Les indicateurs répondent à une période choisie, et pas seulement au total
 * depuis l'ouverture du registre : « combien de certifications ce mois-ci »
 * est la question qu'on se pose, « combien depuis toujours » celle qu'on
 * regarde une fois.
 *
 * Les répartitions par domaine et par programme sont calculées côté client, à
 * partir du registre déjà chargé. Une agrégation côté base serait plus
 * économe, mais imposerait un aller-retour de plus à chaque changement de
 * période — et le registre d'un organisme de formation se compte en milliers de
 * lignes, pas en millions.
 */

import { useMemo, useState } from "react";
import { effectiveStatus } from "../../lib/certificates.js";
import { fmtShort } from "../../lib/dates.js";
import { peut } from "../../lib/permissions.js";
import { monthlySeries } from "../../lib/series.js";
import { Badge, BarChart, Stat } from "../../ui/primitives.jsx";

const PERIODES = [
  { cle: "30", label: "30 derniers jours", jours: 30 },
  { cle: "90", label: "90 derniers jours", jours: 90 },
  { cle: "365", label: "12 derniers mois", jours: 365 },
  { cle: "tout", label: "Depuis l'ouverture", jours: null },
];

function AdminDashboard(p) {
  const [periode, setPeriode] = useState("30");
  const choisie = PERIODES.find((x) => x.cle === periode) || PERIODES[0];

  const depuis = useMemo(() => {
    if (!choisie.jours) return null;
    const d = new Date();
    d.setDate(d.getDate() - choisie.jours);
    return d;
  }, [choisie]);

  const dansLaPeriode = (valeur) => {
    if (!depuis || !valeur) return Boolean(valeur) || !depuis;
    return new Date(valeur) >= depuis;
  };

  const certs = p.db.certificates;
  const titulaires = (p.db.users || []).filter((u) => u.role === "CERTIFIED");
  const domaines = p.db.domains || [];
  const programmes = p.db.types || [];

  const surPeriode = depuis ? certs.filter((c) => dansLaPeriode(c.issue_date)) : certs;
  const nouveauxTitulaires = depuis
    ? titulaires.filter((u) => u.created_at && new Date(u.created_at) >= depuis).length
    : titulaires.length;
  const verifsPeriode = depuis
    ? p.db.verifications.filter((v) => new Date(v.verified_at) >= depuis).length
    : p.db.verifications.length;

  const par = (s) => certs.filter((c) => effectiveStatus(c) === s).length;

  /* Répartitions. On compte sur la période choisie : une répartition « depuis
     toujours » masque les programmes qui viennent d'être ouverts. */
  const parDomaine = domaines
    .map((d) => ({
      nom: d.name,
      n: surPeriode.filter((c) => p.typeOf(c).domain_id === d.id).length,
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  const parProgramme = programmes
    .map((t) => ({ nom: t.name, code: t.code, n: surPeriode.filter((c) => c.certificate_type_id === t.id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  const maxDomaine = Math.max(1, ...parDomaine.map((x) => x.n));
  const maxProgramme = Math.max(1, ...parProgramme.map((x) => x.n));

  const recents = [...certs]
    .sort((a, b) => new Date(b.created_at || b.issue_date) - new Date(a.created_at || a.issue_date))
    .slice(0, 6);

  const enAttente = titulaires.filter((u) => u.must_change_password).length;
  const notificationsRatees = (p.db.notifications || []).filter((n) => n.status === "FAILED" || n.status === "PENDING").length;

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Vue d'ensemble</div>
          <h1 style={{ marginTop: 8 }}>Tableau de bord</h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select className="vz-select" style={{ width: "auto" }} value={periode} onChange={(e) => setPeriode(e.target.value)}>
            {PERIODES.map((x) => <option key={x.cle} value={x.cle}>{x.label}</option>)}
          </select>
          {peut(p.session, "attribuer_certificats") && (
            <button className="vz-btn vz-btn-primary" onClick={() => p.setModal({ type: "form", c: null })}>+ Attribuer</button>
          )}
        </div>
      </div>

      {(enAttente > 0 || notificationsRatees > 0) && (
        <div className="vz-alert info" style={{ marginBottom: 16 }}>
          <span>
            {enAttente > 0 && <>{enAttente} certifié{enAttente > 1 ? "s n'ont" : " n'a"} pas encore activé son compte. </>}
            {notificationsRatees > 0 && (
              <>
                {notificationsRatees} notification{notificationsRatees > 1 ? "s" : ""} n'
                {notificationsRatees > 1 ? "ont" : "a"} pas été remise{notificationsRatees > 1 ? "s" : ""} —{" "}
                <button className="vz-linkbtn" style={{ padding: 0 }} onClick={() => p.setPage("notifications")}>voir le détail</button>.
              </>
            )}
          </span>
        </div>
      )}

      <div className="vz-grid vz-stats" style={{ marginBottom: 16 }}>
        <Stat label="Certifiés" value={titulaires.length} sub="Titulaires enregistrés" />
        <Stat label="Certifications" value={certs.length} accent="var(--bleu)" sub="Délivrées depuis l'ouverture" />
        <Stat label={choisie.jours ? "Sur la période" : "Sur l'ensemble"} value={surPeriode.length} accent="var(--violet)" sub={choisie.label.toLowerCase()} />
        <Stat label="Nouveaux certifiés" value={nouveauxTitulaires} sub={choisie.jours ? choisie.label.toLowerCase() : "au total"} />
        <Stat label="En vigueur" value={par("ACTIVE")} accent="var(--vert)" sub="Vérifiables publiquement" />
        <Stat label="Révoqués" value={par("REVOKED")} accent="var(--rouge)" sub="Retirés par VIZDATA" />
        <Stat label="Vérifications" value={verifsPeriode} sub={choisie.jours ? choisie.label.toLowerCase() : "consultations publiques"} />
        <Stat label="Domaines actifs" value={parDomaine.length} sub="Ayant délivré sur la période" />
      </div>

      <div className="vz-grid vz-deux">
        <div className="vz-card">
          <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Par domaine</h3><span className="vz-small vz-muted">{choisie.label}</span></div>
          <div className="vz-card-body">
            {parDomaine.length === 0 ? (
              <div className="vz-empty" style={{ padding: "26px 0" }}>Aucune certification délivrée sur cette période.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {parDomaine.map((x) => (
                  <Jauge key={x.nom} nom={x.nom} n={x.n} max={maxDomaine} couleur="var(--bleu)" />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="vz-card">
          <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Par programme</h3><span className="vz-small vz-muted">8 premiers</span></div>
          <div className="vz-card-body">
            {parProgramme.length === 0 ? (
              <div className="vz-empty" style={{ padding: "26px 0" }}>Aucune certification délivrée sur cette période.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {parProgramme.map((x) => (
                  <Jauge key={x.code} nom={x.nom} n={x.n} max={maxProgramme} couleur="var(--violet)" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="vz-grid vz-deux" style={{ marginTop: 16 }}>
        <div className="vz-card">
          <div className="vz-card-head">
            <h3 style={{ fontSize: 14 }}>Dernières certifications délivrées</h3>
            <button className="vz-linkbtn" onClick={() => p.setPage("certificates")}>Tout voir</button>
          </div>
          <div className="vz-tablewrap">
            <table className="vz-table">
              <thead><tr><th>Référence</th><th>Certifié</th><th>Statut</th></tr></thead>
              <tbody>
                {recents.map((c) => {
                  const u = p.userOf(c);
                  return (
                    <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => p.setModal({ type: "detail", c })}>
                      <td className="vz-ref" style={{ color: "var(--bleu)" }}>{c.reference}</td>
                      <td>{u.first_name} {u.last_name}</td>
                      <td><Badge status={effectiveStatus(c)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {recents.length === 0 && <div className="vz-empty">Aucune certification délivrée.</div>}
        </div>

        <div className="vz-card">
          <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Certifications délivrées par mois</h3></div>
          <div className="vz-card-body"><BarChart data={monthlySeries(certs, "issue_date")} /></div>
        </div>
      </div>

      <div className="vz-card" style={{ marginTop: 16 }}>
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Journal des actions</h3></div>
        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead><tr><th>Action</th><th>Objet</th><th>Auteur</th><th>Date</th></tr></thead>
            <tbody>
              {(p.db.audit_logs || []).slice(0, 10).map((l) => (
                <tr key={l.id}>
                  <td><span className="vz-mono vz-small">{l.action}</span></td>
                  <td className="vz-ref vz-small">{typeof l.metadata === "string" ? l.metadata : ""}</td>
                  <td className="vz-small">{l.actor || nomAuteur(p.db.users, l.actor_id)}</td>
                  <td className="vz-small vz-muted">{fmtShort(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(p.db.audit_logs || []).length === 0 && <div className="vz-empty">Le journal est vide.</div>}
      </div>
    </>
  );
}

/** Le registre distant stocke l'identifiant de l'auteur ; le local, son nom. */
function nomAuteur(users, id) {
  const u = (users || []).find((x) => x.id === id);
  return u ? `${u.first_name} ${u.last_name}` : "—";
}

function Jauge({ nom, n, max, couleur }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, marginBottom: 6 }}>
        <span style={{ fontWeight: 500 }}>{nom}</span>
        <span className="vz-mono vz-small vz-muted">{n}</span>
      </div>
      <div className="vz-jauge"><div style={{ width: `${(n / max) * 100}%`, background: couleur }} /></div>
    </div>
  );
}

export { AdminDashboard };
