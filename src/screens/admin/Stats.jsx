/* Statistiques du registre.
 *
 * Le tableau de bord répond à « où en est-on cette semaine ». Cet écran répond
 * à « que vaut le registre depuis son ouverture » : les totaux, les
 * répartitions complètes, et la mesure de l'usage public — vérifications,
 * partages, téléchargements.
 */

import { effectiveStatus } from "../../lib/certificates.js";
import { monthlySeries } from "../../lib/series.js";
import { BarChart, Stat } from "../../ui/primitives.jsx";

function AdminStats(p) {
  const certs = p.db.certificates;
  const par = (s) => certs.filter((c) => effectiveStatus(c) === s).length;

  const journal = p.db.audit_logs || [];
  const telechargements = journal.filter((l) => l.action === "CERTIFICATE_DOWNLOADED").length;
  const impressions = journal.filter((l) => l.action === "CERTIFICATE_PRINTED").length;

  const domaines = (p.db.domains || []).map((d) => {
    const programmes = (p.db.types || []).filter((t) => t.domain_id === d.id);
    const ids = new Set(programmes.map((t) => t.id));
    const liste = certs.filter((c) => ids.has(c.certificate_type_id));
    return {
      nom: d.name,
      programmes: programmes.length,
      n: liste.length,
      verifications: p.db.verifications.filter((v) => liste.some((c) => c.id === v.certificate_id)).length,
    };
  });

  const programmes = (p.db.types || []).map((t) => {
    const liste = certs.filter((c) => c.certificate_type_id === t.id);
    return {
      nom: t.name,
      code: t.code,
      n: liste.length,
      verifications: p.db.verifications.filter((v) => liste.some((c) => c.id === v.certificate_id)).length,
    };
  }).sort((a, b) => b.n - a.n);

  const maxDomaine = Math.max(1, ...domaines.map((x) => x.n));
  const maxProgramme = Math.max(1, ...programmes.map((x) => x.n));

  /* Un certificat vérifié plusieurs fois compte une fois : c'est la mesure de
     la portée du registre, pas du trafic. */
  const certificatsVerifies = new Set(p.db.verifications.map((v) => v.certificate_id)).size;
  const portee = certs.length ? Math.round((certificatsVerifies / certs.length) * 100) : 0;

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Mesure</div>
          <h1 style={{ marginTop: 8 }}>Statistiques</h1>
        </div>
      </div>

      <div className="vz-grid vz-stats" style={{ marginBottom: 16 }}>
        <Stat label="Certifications" value={certs.length} sub="Délivrées depuis l'ouverture" />
        <Stat label="En vigueur" value={par("ACTIVE")} accent="var(--vert)" />
        <Stat label="Révoquées" value={par("REVOKED")} accent="var(--rouge)" />
        <Stat label="Annulées" value={par("CANCELLED")} />
        <Stat label="Certifiés" value={(p.db.users || []).filter((u) => u.role === "CERTIFIED").length} />
        <Stat label="Vérifications" value={p.db.verifications.length} accent="var(--bleu)" sub="Consultations publiques" />
        <Stat label="Partages" value={(p.db.shares || []).length} accent="var(--violet)" />
        <Stat label="Sorties du document" value={telechargements + impressions} sub={`${telechargements} PDF · ${impressions} impressions`} />
      </div>

      <div className="vz-alert info" style={{ marginBottom: 16 }}>
        {portee}&nbsp;% des certificats délivrés ont été vérifiés au moins une fois
        ({certificatsVerifies} sur {certs.length}). C'est la mesure qui compte pour un registre :
        un certificat jamais vérifié n'a servi à personne.
      </div>

      <div className="vz-grid vz-deux">
        <div className="vz-card">
          <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Certifications délivrées par mois</h3></div>
          <div className="vz-card-body"><BarChart data={monthlySeries(certs, "issue_date")} /></div>
        </div>
        <div className="vz-card">
          <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Vérifications par mois</h3></div>
          <div className="vz-card-body"><BarChart data={monthlySeries(p.db.verifications, "verified_at")} alt /></div>
        </div>
      </div>

      <div className="vz-card" style={{ marginTop: 16 }}>
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Répartition par domaine</h3></div>
        {domaines.length === 0 ? (
          <div className="vz-empty">Aucun domaine n'est défini.</div>
        ) : (
          <div className="vz-card-body" style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            {domaines.map((x) => (
              <div key={x.nom}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, marginBottom: 6 }}>
                  <span style={{ fontWeight: 500 }}>{x.nom}</span>
                  <span className="vz-mono vz-small vz-muted">
                    {x.n} certification{x.n > 1 ? "s" : ""} · {x.programmes} programme{x.programmes > 1 ? "s" : ""} · {x.verifications} vérification{x.verifications > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="vz-jauge"><div style={{ width: `${(x.n / maxDomaine) * 100}%`, background: "var(--bleu)" }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="vz-card" style={{ marginTop: 16 }}>
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Répartition par programme</h3></div>
        {programmes.length === 0 ? (
          <div className="vz-empty">Aucun programme n'est défini.</div>
        ) : (
          <div className="vz-card-body" style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {programmes.map((x) => (
              <div key={x.code}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, marginBottom: 6 }}>
                  <span style={{ fontWeight: 500 }}>{x.nom}</span>
                  <span className="vz-mono vz-small vz-muted">{x.n} · {x.verifications} vérif.</span>
                </div>
                <div className="vz-jauge"><div style={{ width: `${(x.n / maxProgramme) * 100}%`, background: "var(--violet)" }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export { AdminStats };
