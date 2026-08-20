/* Création et modification d'un certificat. */

import { useState } from "react";
import { SKILLS, token } from "../../data/seed.js";
import { nextReference, slugify } from "../../lib/certificates.js";
import { Field, Modal } from "../../ui/primitives.jsx";

function CertificateForm({ cert, onClose, ...p }) {
  const isNew = !cert;
  const firstType = p.db.types[0];
  const [f, setF] = useState(() =>
    cert
      ? { ...cert, ...(() => { const u = p.userOf(cert); return { first_name: u.first_name, last_name: u.last_name, email: u.email }; })() }
      : {
          first_name: "", last_name: "", email: "",
          certificate_type_id: firstType.id,
          issue_date: new Date().toISOString().slice(0, 10),
          expiry_date: "", score: "", duration: firstType.default_duration,
          trainer: "Fabrice BOH", signatory: "Direction VIZDATA", skills: [], status: "ACTIVE",
        }
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const onType = (id) => {
    /* Les identifiants sont numériques en démonstration et uuid côté base. */
    const t = p.db.types.find((x) => String(x.id) === String(id));
    const next = { ...f, certificate_type_id: t.id, duration: t.default_duration };
    if (isNew && t.validity_period) {
      const d = new Date(f.issue_date || new Date());
      d.setMonth(d.getMonth() + t.validity_period);
      next.expiry_date = d.toISOString().slice(0, 10);
    } else if (isNew) next.expiry_date = "";
    setF(next);
  };

  const toggleSkill = (id) => setF({ ...f, skills: f.skills.includes(id) ? f.skills.filter((s) => s !== id) : [...f.skills, id] });

  const submit = async () => {
    if (busy) return;
    if (!f.first_name.trim() || !f.last_name.trim() || !f.email.trim()) { setErr("Prénom, nom et e-mail sont obligatoires."); return; }
    if (!/^\S+@\S+\.\S+$/.test(f.email)) { setErr("L'adresse e-mail n'est pas valide."); return; }
    if (!f.issue_date) { setErr("La date d'émission est obligatoire."); return; }

    /* --- registre distant --------------------------------------------------
       Un titulaire ne peut pas être créé ici : public.users.id référence
       auth.users(id), donc il faudrait d'abord ouvrir un compte
       d'authentification, ce que la clé publiable ne permet pas. On le dit
       plutôt que de faire échouer l'enregistrement sans explication. */
    if (p.actions) {
      const adresse = f.email.trim().toLowerCase();
      const titulaire = p.db.users.find((u) => u.email.toLowerCase() === adresse);
      if (!titulaire) {
        setErr("Ce titulaire n'est pas enregistré. Créez d'abord son compte depuis la console Supabase, puis revenez lui délivrer un certificat.");
        return;
      }

      const type = p.db.types.find((t) => t.id === f.certificate_type_id);
      const champs = {
        user_id: titulaire.id,
        certificate_type_id: f.certificate_type_id,
        issue_date: f.issue_date,
        expiry_date: f.expiry_date || null,
        score: f.score === "" ? null : Number(f.score),
        duration: Number(f.duration) || type.default_duration,
        trainer: f.trainer,
        signatory: f.signatory,
      };

      setBusy(true);
      setErr("");
      try {
        await p.actions.saveCertificate({
          id: isNew ? null : cert.id,
          code: type.code,
          fields: isNew ? champs : { ...champs, reference: cert.reference },
          skillIds: f.skills,
        });
      } catch (e) {
        setErr(e.message);
        setBusy(false);
        return;
      }
      p.notify(isNew ? "Certificat créé. Référence et QR code générés." : "Certificat mis à jour.");
      onClose();
      return;
    }

    p.setDb((d) => {
      let users = d.users;
      let user = users.find((u) => u.email.toLowerCase() === f.email.toLowerCase().trim());
      if (!user) {
        const id = Math.max(...users.map((u) => u.id)) + 1;
        user = {
          id, first_name: f.first_name.trim(), last_name: f.last_name.trim(), email: f.email.trim().toLowerCase(),
          username: slugify(`${f.first_name} ${f.last_name}`), linkedin_url: "", public_profile: false, role: "CERTIFIED",
        };
        users = [...users, user];
      }

      const type = d.types.find((t) => t.id === Number(f.certificate_type_id));
      let certificates;
      if (isNew) {
        const year = new Date(f.issue_date).getFullYear();
        const nc = {
          id: (Math.max(0, ...d.certificates.map((c) => c.id)) || 0) + 1,
          reference: nextReference(d.certificates, type.code, year),
          public_token: token(),
          user_id: user.id,
          certificate_type_id: type.id,
          issue_date: f.issue_date,
          expiry_date: f.expiry_date || null,
          status: "ACTIVE",
          score: f.score === "" ? null : Number(f.score),
          duration: Number(f.duration) || type.default_duration,
          trainer: f.trainer, signatory: f.signatory, pdf_url: "",
          skills: f.skills, revoke_reason: "",
          created_at: new Date().toISOString(),
        };
        certificates = [nc, ...d.certificates];
      } else {
        certificates = d.certificates.map((c) =>
          c.id === cert.id
            ? { ...c, certificate_type_id: Number(f.certificate_type_id), issue_date: f.issue_date, expiry_date: f.expiry_date || null, score: f.score === "" ? null : Number(f.score), duration: Number(f.duration), trainer: f.trainer, signatory: f.signatory, skills: f.skills }
            : c
        );
        users = users.map((u) => (u.id === cert.user_id ? { ...u, first_name: f.first_name, last_name: f.last_name } : u));
      }
      return { ...d, users, certificates };
    });

    p.notify(isNew ? "Certificat créé. Référence et QR code générés." : "Certificat mis à jour.");
    onClose();
  };

  return (
    <Modal
      title={isNew ? "Nouveau certificat" : "Modifier le certificat"}
      onClose={onClose}
      wide
      foot={
        <>
          <button className="vz-btn" onClick={onClose}>Annuler</button>
          <button className="vz-btn vz-btn-primary" onClick={submit} disabled={busy}>{busy ? "Enregistrement…" : isNew ? "Créer le certificat" : "Enregistrer"}</button>
        </>
      }
    >
      {err && <div className="vz-alert err" style={{ marginBottom: 14 }}>{err}</div>}
      {isNew && (
        <div className="vz-alert info" style={{ marginBottom: 16 }}>
          La référence, le jeton public et le QR code sont générés automatiquement à la création.
        </div>
      )}
      <div className="vz-form-grid">
        <Field label="Prénom"><input className="vz-input" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
        <Field label="Nom"><input className="vz-input" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
        <Field label="Adresse e-mail" hint={isNew ? "Un compte certifié est créé si l'adresse est inconnue." : null}>
          <input className="vz-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} readOnly={!isNew} style={!isNew ? { background: "var(--surface)" } : null} />
        </Field>
        <Field label="Certification">
          <select className="vz-select" value={f.certificate_type_id} onChange={(e) => onType(e.target.value)}>
            {p.db.types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
          </select>
        </Field>
        <Field label="Date d'émission"><input className="vz-input" type="date" value={f.issue_date} onChange={(e) => setF({ ...f, issue_date: e.target.value })} /></Field>
        <Field label="Date d'expiration" hint="Laisser vide pour un certificat sans expiration."><input className="vz-input" type="date" value={f.expiry_date || ""} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} /></Field>
        <Field label="Score sur 100"><input className="vz-input" type="number" min="0" max="100" value={f.score ?? ""} onChange={(e) => setF({ ...f, score: e.target.value })} /></Field>
        <Field label="Durée (heures)"><input className="vz-input" type="number" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></Field>
        <Field label="Formateur"><input className="vz-input" value={f.trainer} onChange={(e) => setF({ ...f, trainer: e.target.value })} /></Field>
        <Field label="Responsable signataire"><input className="vz-input" value={f.signatory} onChange={(e) => setF({ ...f, signatory: e.target.value })} /></Field>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="vz-label" style={{ marginBottom: 8 }}>Compétences validées</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(p.db.skills || SKILLS).map((s) => (
            <button
              key={s.id}
              className="vz-chip"
              onClick={() => toggleSkill(s.id)}
              style={f.skills.includes(s.id) ? { background: "#EAF4F9", borderColor: "#B7DAE9", color: "var(--bleu)", fontWeight: 500 } : null}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Field label="Fichier PDF du certificat" hint="Optionnel : un PDF est généré à partir du modèle VIZDATA si aucun fichier n'est fourni.">
          <input className="vz-input" type="file" accept="application/pdf" style={{ paddingTop: 6 }} onChange={() => p.notify("Le fichier serait déposé dans le stockage sécurisé.")} />
        </Field>
      </div>
    </Modal>
  );
}

export { CertificateForm };
