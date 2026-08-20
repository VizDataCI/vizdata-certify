/* Annuaire des titulaires. */

import { useState } from "react";
import { effectiveStatus } from "../../lib/certificates.js";

function AdminCertified(p) {
  const [q, setQ] = useState("");
  const users = p.db.users.filter((u) => u.role === "CERTIFIED").filter((u) => `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Titulaires</div>
          <h1 style={{ marginTop: 8 }}>Certifiés</h1>
        </div>
      </div>
      <div className="vz-card">
        <div className="vz-card-head">
          <input className="vz-input" style={{ maxWidth: 330 }} placeholder="Rechercher un certifié" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead><tr><th>Nom</th><th>E-mail</th><th>Certificats</th><th>Profil public</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => {
                const cs = p.db.certificates.filter((c) => c.user_id === u.id);
                const act = cs.filter((c) => effectiveStatus(c) === "ACTIVE").length;
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.first_name} {u.last_name}</td>
                    <td className="vz-small vz-muted">{u.email}</td>
                    <td className="vz-mono vz-small">{cs.length} ({act} valide{act > 1 ? "s" : ""})</td>
                    <td className="vz-small">{u.public_profile ? <span className="vz-mono" style={{ color: "var(--bleu)" }}>/u/{u.username}</span> : <span className="vz-muted">Désactivé</span>}</td>
                    <td>
                      <div className="vz-rowactions">
                        {u.public_profile && <button className="vz-linkbtn" onClick={() => p.go({ view: "publicProfile", username: u.username })}>Profil</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {users.length === 0 && <div className="vz-empty">Aucun certifié ne correspond à cette recherche.</div>}
      </div>
    </>
  );
}

export { AdminCertified };
