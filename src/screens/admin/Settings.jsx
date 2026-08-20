/* Types de certification et paramètres du registre. */

import { useState } from "react";
import { resetDb } from "../../data/store.js";
import { Field } from "../../ui/primitives.jsx";

function AdminSettings(p) {
  const [nt, setNt] = useState({ code: "", name: "", description: "", default_duration: 20, validity_period: 24 });
  const [askReset, setAskReset] = useState(false);

  const doReset = () => {
    p.setDb(resetDb());
    setAskReset(false);
    p.notify("Registre réinitialisé au jeu de démonstration.");
  };

  const addType = async () => {
    if (!nt.code.trim() || !nt.name.trim()) { p.notify("Le code et le libellé sont obligatoires."); return; }
    if (p.db.types.some((t) => t.code === nt.code.toUpperCase())) { p.notify("Ce code de certification existe déjà."); return; }

    const champs = {
      code: nt.code.toUpperCase().trim(),
      name: nt.name.trim(),
      description: nt.description,
      default_duration: Number(nt.default_duration),
      validity_period: nt.validity_period ? Number(nt.validity_period) : null,
      status: "ACTIVE",
    };

    try {
      if (p.actions) {
        await p.actions.addType(champs);
      } else {
        p.setDb((d) => ({ ...d, types: [...d.types, { id: Math.max(...d.types.map((t) => t.id)) + 1, ...champs }] }));
      }
      setNt({ code: "", name: "", description: "", default_duration: 20, validity_period: 24 });
      p.notify("Type de certification ajouté.");
    } catch (e) {
      p.notify(e.message);
    }
  };

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Configuration</div>
          <h1 style={{ marginTop: 8 }}>Paramètres</h1>
        </div>
      </div>

      <div className="vz-card" style={{ marginBottom: 16 }}>
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Types de certification</h3></div>
        <div className="vz-tablewrap">
          <table className="vz-table">
            <thead><tr><th>Code</th><th>Libellé</th><th>Durée</th><th>Validité</th><th>Certificats</th></tr></thead>
            <tbody>
              {p.db.types.map((t) => (
                <tr key={t.id}>
                  <td className="vz-mono" style={{ fontWeight: 500 }}>{t.code}</td>
                  <td>{t.name}</td>
                  <td className="vz-mono vz-small">{t.default_duration} h</td>
                  <td className="vz-small">{t.validity_period ? `${t.validity_period} mois` : "Sans expiration"}</td>
                  <td className="vz-mono vz-small">{p.db.certificates.filter((c) => c.certificate_type_id === t.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="vz-card-body" style={{ borderTop: "1px solid var(--trait)" }}>
          <div className="vz-eyebrow" style={{ marginBottom: 12 }}>Ajouter un type</div>
          <div className="vz-form-grid">
            <Field label="Code" hint="Utilisé dans la référence : VIZ-2026-CODE-000001"><input className="vz-input" value={nt.code} onChange={(e) => setNt({ ...nt, code: e.target.value })} placeholder="PYTHON" /></Field>
            <Field label="Libellé"><input className="vz-input" value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })} placeholder="Python for Data Analysis" /></Field>
            <Field label="Durée par défaut (heures)"><input className="vz-input" type="number" value={nt.default_duration} onChange={(e) => setNt({ ...nt, default_duration: e.target.value })} /></Field>
            <Field label="Validité (mois)" hint="Laisser vide pour un certificat sans expiration."><input className="vz-input" type="number" value={nt.validity_period} onChange={(e) => setNt({ ...nt, validity_period: e.target.value })} /></Field>
          </div>
          <button className="vz-btn vz-btn-primary" style={{ marginTop: 14 }} onClick={addType}>Ajouter le type</button>
        </div>
      </div>

      <div className="vz-card">
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Registre</h3></div>
        <div className="vz-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Nom de l'organisme émetteur"><input className="vz-input" defaultValue="VIZDATA" /></Field>
          <Field label="Domaine de vérification"><input className="vz-input vz-mono" defaultValue="certify.vizdata.ci" /></Field>
          <Field label="Format de référence"><input className="vz-input vz-mono" defaultValue="VIZ-{ANNÉE}-{CODE}-{NUMÉRO}" readOnly style={{ background: "var(--surface)" }} /></Field>
          <div className="vz-alert info">
            L'expiration est calculée automatiquement à partir de la date d'échéance : un certificat échu bascule seul en « Expiré », sans intervention.
          </div>
          <div style={{ borderTop: "1px solid var(--trait)", paddingTop: 15 }}>
            <div className="vz-label">Données de démonstration</div>
            <p className="vz-small vz-muted" style={{ margin: "5px 0 11px", lineHeight: 1.6 }}>
              Le registre est conservé dans le stockage de ce navigateur. La réinitialisation efface les modifications locales et restaure le jeu de démonstration.
            </p>
            {askReset ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="vz-btn vz-btn-danger" onClick={doReset}>Confirmer la réinitialisation</button>
                <button className="vz-btn" onClick={() => setAskReset(false)}>Annuler</button>
              </div>
            ) : (
              <button className="vz-btn" onClick={() => setAskReset(true)}>Réinitialiser le registre</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export { AdminSettings };
