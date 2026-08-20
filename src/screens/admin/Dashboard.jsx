/* Vue d'ensemble. */

import { effectiveStatus } from "../../lib/certificates.js";
import { fmtShort } from "../../lib/dates.js";
import { monthlySeries } from "../../lib/series.js";
import { Badge, BarChart, Stat } from "../../ui/primitives.jsx";

function AdminDashboard(p) {
  const certs = p.db.certificates;
  const by = (s) => certs.filter((c) => effectiveStatus(c) === s).length;
  const recent = [...certs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Vue d'ensemble</div>
          <h1 style={{ marginTop: 8 }}>Dashboard</h1>
        </div>
        <button className="vz-btn vz-btn-primary" onClick={() => p.setModal({ type: "form", c: null })}>+ Nouveau certificat</button>
      </div>

      <div className="vz-grid vz-stats" style={{ marginBottom: 16 }}>
        <Stat label="Délivrés" value={certs.length} sub="Depuis l'ouverture du registre" />
        <Stat label="Actifs" value={by("ACTIVE")} accent="var(--vert)" sub="En cours de validité" />
        <Stat label="Expirés" value={by("EXPIRED")} accent="var(--orange)" sub="Validité échue" />
        <Stat label="Révoqués" value={by("REVOKED")} accent="var(--rouge)" sub="Retirés par VIZDATA" />
        <Stat label="Certifiés" value={p.db.users.filter((u) => u.role === "CERTIFIED").length} sub="Titulaires enregistrés" />
        <Stat label="Vérifications" value={p.db.verifications.length} accent="var(--bleu)" sub="Consultations publiques" />
      </div>

      <div className="vz-grid" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <div className="vz-card">
          <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Derniers certificats</h3><button className="vz-linkbtn" onClick={() => p.setPage("certificates")}>Tout voir</button></div>
          <div className="vz-tablewrap">
            <table className="vz-table">
              <thead><tr><th>Référence</th><th>Titulaire</th><th>Statut</th></tr></thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => p.setModal({ type: "detail", c })}>
                    <td className="vz-ref" style={{ color: "var(--bleu)" }}>{c.reference}</td>
                    <td>{p.userOf(c).first_name} {p.userOf(c).last_name}</td>
                    <td><Badge status={effectiveStatus(c)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="vz-card">
          <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Vérifications par mois</h3></div>
          <div className="vz-card-body"><BarChart data={monthlySeries(p.db.verifications, "verified_at")} alt /></div>
        </div>
      </div>

      <div className="vz-card" style={{ marginTop: 16 }}>
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Historique récent</h3></div>
        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead><tr><th>Action</th><th>Objet</th><th>Auteur</th><th>Date</th></tr></thead>
            <tbody>
              {p.db.audit_logs.slice(0, 8).map((l) => (
                <tr key={l.id}>
                  <td><span className="vz-mono vz-small">{l.action}</span></td>
                  <td className="vz-ref vz-small">{l.metadata}</td>
                  <td className="vz-small">{l.actor}</td>
                  <td className="vz-small vz-muted">{fmtShort(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export { AdminDashboard };
