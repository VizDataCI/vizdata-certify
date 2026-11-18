/* Journal des vérifications publiques. */

import { fmtShort } from "../../lib/dates.js";
import { IconeInfo } from "../../ui/icones.jsx";

function AdminVerifications(p) {
  const rows = [...p.db.verifications].sort((a, b) => new Date(b.verified_at) - new Date(a.verified_at)).slice(0, 80);
  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Traçabilité</div>
          <h1 style={{ marginTop: 8 }}>Vérifications</h1>
          <p>Chaque consultation publique d'un certificat laisse une trace, sans jamais identifier qui vérifie.</p>
        </div>
        <span className="vz-chip">{p.db.verifications.length} au total</span>
      </div>
      <div className="vz-alert info" style={{ marginBottom: 14 }}>
        <IconeInfo size={17} />
        <span>
          Le vérificateur n'est jamais identifié : ni nom, ni adresse e-mail, ni compte. Sont
          enregistrés la source, le pays, l'horodatage, le navigateur et une empreinte de l'adresse IP.
          Cette empreinte sert uniquement à limiter les tentatives d'énumération de jetons. Restant une
          donnée personnelle au sens du RGPD, elle doit figurer au registre des traitements avec une
          durée de conservation définie.
        </span>
      </div>
      <div className="vz-card">
        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead><tr><th>Date</th><th>Certificat</th><th>Titulaire</th><th>Source</th><th>Pays</th></tr></thead>
            <tbody>
              {rows.map((v) => {
                const c = p.db.certificates.find((x) => x.id === v.certificate_id);
                if (!c) return null;
                const u = p.userOf(c);
                return (
                  <tr key={v.id}>
                    <td className="vz-mono vz-small vz-muted">{fmtShort(v.verified_at)}</td>
                    <td className="vz-ref vz-small" style={{ color: "var(--bleu)" }}>{c.reference}</td>
                    <td className="vz-small">{u.first_name} {u.last_name}</td>
                    <td className="vz-small">{v.source}</td>
                    <td className="vz-mono vz-small">{v.country}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export { AdminVerifications };
