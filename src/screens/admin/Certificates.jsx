/* Registre des certificats : recherche et filtres. */

import { useState } from "react";
import { STATUS_META, effectiveStatus } from "../../lib/certificates.js";
import { fmtShort } from "../../lib/dates.js";
import { Badge } from "../../ui/primitives.jsx";

function AdminCertificates(p) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");

  const rows = p.db.certificates.filter((c) => {
    const u = p.userOf(c);
    const t = p.typeOf(c);
    const hay = `${c.reference} ${u.first_name} ${u.last_name} ${u.email} ${t.name} ${t.code}`.toLowerCase();
    if (q && !hay.includes(q.toLowerCase())) return false;
    if (status && effectiveStatus(c) !== status) return false;
    if (type && c.certificate_type_id !== Number(type)) return false;
    return true;
  });

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Registre</div>
          <h1 style={{ marginTop: 8 }}>Certificats</h1>
        </div>
        <button className="vz-btn vz-btn-primary" onClick={() => p.setModal({ type: "form", c: null })}>+ Nouveau certificat</button>
      </div>

      <div className="vz-card">
        <div className="vz-card-head" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="vz-input" style={{ maxWidth: 330 }} placeholder="Rechercher : référence, nom, e-mail, certification" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <select className="vz-select" style={{ width: "auto" }} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Toutes les certifications</option>
              {p.db.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className="vz-select" style={{ width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tous les statuts</option>
              {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
          </div>
        </div>
        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead>
              <tr><th>Référence</th><th>Nom</th><th>Certification</th><th>Date</th><th>Statut</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const u = p.userOf(c);
                return (
                  <tr key={c.id}>
                    <td className="vz-ref" style={{ color: "var(--bleu)", whiteSpace: "nowrap" }}>{c.reference}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{u.first_name} {u.last_name}</td>
                    <td>{p.typeOf(c).name}</td>
                    <td className="vz-mono vz-small">{fmtShort(c.issue_date)}</td>
                    <td><Badge status={effectiveStatus(c)} /></td>
                    <td>
                      <div className="vz-rowactions">
                        <button className="vz-linkbtn" onClick={() => p.setModal({ type: "detail", c })}>Voir</button>
                        <button className="vz-linkbtn" onClick={() => p.setModal({ type: "form", c })}>Modifier</button>
                        <button className="vz-linkbtn" onClick={() => p.setModal({ type: "cert", c })}>PDF</button>
                        {effectiveStatus(c) !== "REVOKED" && <button className="vz-linkbtn danger" onClick={() => p.setModal({ type: "revoke", c })}>Révoquer</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="vz-empty">Aucun certificat ne correspond à cette recherche. Modifiez les filtres ou créez un certificat.</div>}
      </div>
      <p className="vz-small vz-muted" style={{ marginTop: 10 }}>{rows.length} résultat{rows.length > 1 ? "s" : ""} sur {p.db.certificates.length} certificats.</p>
    </>
  );
}

export { AdminCertificates };
