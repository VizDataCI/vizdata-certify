/* Révocation ou annulation d'un certificat. */

import { useState } from "react";
import { Field, Modal } from "../../ui/primitives.jsx";

function RevokeModal({ cert, onClose, ...p }) {
  const [reason, setReason] = useState("");
  const [action, setAction] = useState("REVOKED");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      if (p.actions) {
        await p.actions.setStatus(cert, action, reason);
      } else {
        p.setDb((d) => ({
          ...d,
          certificates: d.certificates.map((c) => (c.id === cert.id ? { ...c, status: action, revoke_reason: reason } : c)),
        }));
        p.log(action === "REVOKED" ? "CERTIFICATE_REVOKED" : "CERTIFICATE_CANCELLED", cert.id, cert.reference);
      }
      p.notify(action === "REVOKED" ? "Certificat révoqué." : "Certificat annulé.");
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Retirer un certificat"
      onClose={onClose}
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Annuler</button>
          <button className="vz-btn vz-btn-danger" onClick={submit} disabled={busy}>{busy ? "Enregistrement…" : "Confirmer"}</button>
        </>
      }
    >
      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="vz-alert warn" style={{ marginBottom: 16 }}>
        La page publique <span className="vz-ref">{cert.reference}</span> affichera immédiatement ce nouveau statut. L'opération est enregistrée dans l'historique.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Action">
          <select className="vz-select" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="REVOKED">Révoquer — le certificat n'est plus reconnu</option>
            <option value="CANCELLED">Annuler — le certificat n'aurait pas dû être émis</option>
          </select>
        </Field>
        <Field label="Motif" hint="Affiché sur la page publique en cas de révocation.">
          <input className="vz-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Non-respect de la charte d'usage du certificat." />
        </Field>
      </div>
    </Modal>
  );
}

export { RevokeModal };
