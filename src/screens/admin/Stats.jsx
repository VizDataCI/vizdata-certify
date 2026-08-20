/* Statistiques du registre. */

import { effectiveStatus } from "../../lib/certificates.js";
import { monthlySeries } from "../../lib/series.js";
import { BarChart, Stat } from "../../ui/primitives.jsx";

function AdminStats(p) {
  const certs = p.db.certificates;
  const by = (s) => certs.filter((c) => effectiveStatus(c) === s).length;
  const downloads = p.db.audit_logs.filter((l) => l.action === "CERTIFICATE_DOWNLOADED").length;

  const byType = p.db.types.map((t) => ({
    name: t.name,
    n: certs.filter((c) => c.certificate_type_id === t.id).length,
    v: p.db.verifications.filter((v) => { const c = certs.find((x) => x.id === v.certificate_id); return c && c.certificate_type_id === t.id; }).length,
  }));
  const maxN = Math.max(1, ...byType.map((x) => x.n));

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Mesure</div>
          <h1 style={{ marginTop: 8 }}>Statistiques</h1>
        </div>
      </div>

      <div className="vz-grid vz-stats" style={{ marginBottom: 16 }}>
        <Stat label="Total" value={certs.length} />
        <Stat label="Actifs" value={by("ACTIVE")} accent="var(--vert)" />
        <Stat label="Expirés" value={by("EXPIRED")} accent="var(--orange)" />
        <Stat label="Révoqués" value={by("REVOKED")} accent="var(--rouge)" />
        <Stat label="Certifiés" value={p.db.users.filter((u) => u.role === "CERTIFIED").length} />
        <Stat label="Vérifications" value={p.db.verifications.length} accent="var(--bleu)" />
        <Stat label="Partages" value={p.db.shares.length} accent="var(--violet)" />
        <Stat label="Téléchargements" value={downloads} />
      </div>

      <div className="vz-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="vz-card">
          <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Certificats délivrés par mois</h3></div>
          <div className="vz-card-body"><BarChart data={monthlySeries(certs, "issue_date")} /></div>
        </div>
        <div className="vz-card">
          <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Vérifications par mois</h3></div>
          <div className="vz-card-body"><BarChart data={monthlySeries(p.db.verifications, "verified_at")} alt /></div>
        </div>
      </div>

      <div className="vz-card" style={{ marginTop: 16 }}>
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Répartition par certification</h3></div>
        <div className="vz-card-body" style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {byType.map((t) => (
            <div key={t.name}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span style={{ fontWeight: 500 }}>{t.name}</span>
                <span className="vz-mono vz-small vz-muted">{t.n} certificat{t.n > 1 ? "s" : ""} · {t.v} vérification{t.v > 1 ? "s" : ""}</span>
              </div>
              <div style={{ height: 6, background: "var(--surface)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(t.n / maxN) * 100}%`, height: "100%", background: "var(--bleu)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export { AdminStats };
