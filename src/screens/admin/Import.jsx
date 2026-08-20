/* Import CSV en masse, avec analyse préalable ligne à ligne. */

import { useState } from "react";
import { token } from "../../data/seed.js";
import { nextReference, slugify } from "../../lib/certificates.js";

const SAMPLE_CSV = `NOM;PRENOM;EMAIL;CERTIFICATION;DATE_EMISSION;DATE_EXPIRATION;SCORE
DIALLO;Awa;awa.diallo@example.ci;EXCEL;2026-08-01;2028-08-01;88
BAMBA;Ibrahim;ibrahim.bamba@example.ci;PBI;2026-08-01;2028-08-01;91
KOFFI;Adjoua;adjoua.koffi@example.ci;DATA;2026-08-02;2029-08-02;79
ZADI;Paul;paul.zadi@example.ci;INCONNU;2026-08-02;;85
BOH;Fabrice;fabrice.boh@vizdata.ci;EXCEL;2026-08-03;2028-08-03;90`;

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { header: [], rows: [] };
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const split = (l) => l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0]).map((h) => h.toUpperCase());
  const rows = lines.slice(1).map(split);
  return { header, rows };
}

function AdminImport(p) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const REQUIRED = ["NOM", "PRENOM", "EMAIL", "CERTIFICATION", "DATE_EMISSION"];

  const analyse = (raw) => {
    const { header, rows } = parseCSV(raw);
    const missing = REQUIRED.filter((h) => !header.includes(h));
    const idx = (k) => header.indexOf(k);
    const seen = new Set();

    const items = rows.map((r, i) => {
      const get = (k) => (idx(k) >= 0 ? r[idx(k)] || "" : "");
      const nom = get("NOM"), prenom = get("PRENOM"), email = get("EMAIL").toLowerCase();
      const code = get("CERTIFICATION").toUpperCase();
      const issue = get("DATE_EMISSION"), exp = get("DATE_EXPIRATION"), score = get("SCORE");
      const errs = [];

      if (!nom || !prenom) errs.push("Nom ou prénom manquant");
      if (!/^\S+@\S+\.\S+$/.test(email)) errs.push("E-mail invalide");
      const type = p.db.types.find((t) => t.code === code);
      if (!type) errs.push(`Certification « ${code || "vide"} » inconnue`);
      if (!issue || isNaN(new Date(issue))) errs.push("Date d'émission invalide");
      if (exp && isNaN(new Date(exp))) errs.push("Date d'expiration invalide");

      /* Sur le registre distant, un titulaire ne peut pas être créé au passage :
         son compte d'authentification doit exister au préalable. */
      if (p.actions && email && !p.db.users.some((u) => u.email.toLowerCase() === email)) {
        errs.push("Titulaire inconnu du registre");
      }

      const key = email + "|" + code;
      let dup = "";
      if (seen.has(key)) dup = "Doublon dans le fichier";
      seen.add(key);
      if (!dup && type && p.db.certificates.some((c) => c.certificate_type_id === type.id && p.userOf(c).email.toLowerCase() === email)) {
        dup = "Certificat déjà existant au registre";
      }

      return { line: i + 2, nom, prenom, email, code, issue, exp, score, type, errs, dup };
    });

    setParsed({ header, missing, items });
    setDone(null);
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => { setText(String(fr.result)); analyse(String(fr.result)); };
    fr.readAsText(file);
  };

  const commit = async () => {
    if (busy) return;
    const ok = parsed.items.filter((it) => it.errs.length === 0 && !it.dup);

    if (p.actions) {
      setBusy(true);
      let crees = 0;
      let refus = 0;
      for (const it of ok) {
        const titulaire = p.db.users.find((u) => u.email.toLowerCase() === it.email);
        try {
          await p.actions.saveCertificate({
            id: null,
            code: it.type.code,
            fields: {
              user_id: titulaire.id,
              certificate_type_id: it.type.id,
              issue_date: it.issue,
              expiry_date: it.exp || null,
              score: it.score ? Number(it.score) : null,
              duration: it.type.default_duration,
              trainer: "Fabrice BOH",
              signatory: "Direction VIZDATA",
            },
            skillIds: [],
          });
          crees++;
        } catch (e) {
          refus++;
          p.notify(`Ligne ${it.line} : ${e.message}`);
        }
      }
      setBusy(false);
      setDone({ ok: crees, err: parsed.items.length - crees });
      setParsed(null);
      setText("");
      if (refus) p.notify(`${refus} ligne(s) refusée(s) par la base.`);
      return;
    }

    p.setDb((d) => {
      let users = [...d.users];
      let certificates = [...d.certificates];
      let nextId = (Math.max(0, ...certificates.map((c) => c.id)) || 0) + 1;

      ok.forEach((it) => {
        let user = users.find((u) => u.email.toLowerCase() === it.email);
        if (!user) {
          user = {
            id: Math.max(...users.map((u) => u.id)) + 1,
            first_name: it.prenom, last_name: it.nom, email: it.email,
            username: slugify(`${it.prenom} ${it.nom}`), linkedin_url: "", public_profile: false, role: "CERTIFIED",
          };
          users.push(user);
        }
        const year = new Date(it.issue).getFullYear();
        certificates = [
          {
            id: nextId++,
            reference: nextReference(certificates, it.type.code, year),
            public_token: token(),
            user_id: user.id,
            certificate_type_id: it.type.id,
            issue_date: it.issue,
            expiry_date: it.exp || null,
            status: "ACTIVE",
            score: it.score ? Number(it.score) : null,
            duration: it.type.default_duration,
            trainer: "Fabrice BOH",
            signatory: "Direction VIZDATA",
            pdf_url: "", skills: [], revoke_reason: "",
            created_at: new Date().toISOString(),
          },
          ...certificates,
        ];
      });
      return { ...d, users, certificates };
    });

    const errCount = parsed.items.length - ok.length;
    setDone({ ok: ok.length, err: errCount });
    setParsed(null);
    setText("");
  };

  const okCount = parsed ? parsed.items.filter((i) => !i.errs.length && !i.dup).length : 0;

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Délivrance en série</div>
          <h1 style={{ marginTop: 8 }}>Import</h1>
        </div>
      </div>

      {done && (
        <div className="vz-alert ok" style={{ marginBottom: 16 }}>
          <div>
            <strong>{done.ok} certificat{done.ok > 1 ? "s" : ""} créé{done.ok > 1 ? "s" : ""} avec succès.</strong>
            {done.err > 0 && <div style={{ marginTop: 4 }}>{done.err} ligne{done.err > 1 ? "s présentent" : " présente"} des erreurs et n'{done.err > 1 ? "ont" : "a"} pas été importée{done.err > 1 ? "s" : ""}.</div>}
            <div style={{ marginTop: 4 }}>Références et QR codes générés automatiquement.</div>
          </div>
        </div>
      )}

      <div className="vz-card">
        <div className="vz-card-head">
          <h3 style={{ fontSize: 14 }}>1. Déposer le fichier</h3>
          <button className="vz-linkbtn" onClick={() => { setText(SAMPLE_CSV); analyse(SAMPLE_CSV); }}>Charger un exemple</button>
        </div>
        <div className="vz-card-body">
          <p className="vz-small vz-muted" style={{ marginBottom: 12 }}>
            Colonnes attendues : <span className="vz-mono">NOM · PRENOM · EMAIL · CERTIFICATION · DATE_EMISSION · DATE_EXPIRATION · SCORE</span>. Séparateur point-virgule ou virgule. La colonne CERTIFICATION reçoit le code du type ({p.db.types.map((t) => t.code).join(", ")}).
            {p.actions && " Les titulaires doivent déjà être enregistrés : l'import ne crée pas de compte."}
          </p>
          <input type="file" accept=".csv,.txt,text/csv" onChange={onFile} className="vz-input" style={{ paddingTop: 6, marginBottom: 12 }} />
          <textarea className="vz-textarea" placeholder="…ou collez directement le contenu du fichier ici." value={text} onChange={(e) => setText(e.target.value)} />
          <button className="vz-btn vz-btn-primary" style={{ marginTop: 12 }} disabled={!text.trim()} onClick={() => analyse(text)}>Analyser le fichier</button>
        </div>
      </div>

      {parsed && (
        <div className="vz-card" style={{ marginTop: 16 }}>
          <div className="vz-card-head">
            <h3 style={{ fontSize: 14 }}>2. Vérifier l'aperçu</h3>
            <span className="vz-chip">{parsed.items.length} ligne{parsed.items.length > 1 ? "s" : ""}</span>
          </div>
          {parsed.missing.length > 0 && (
            <div style={{ padding: "14px 16px 0" }}>
              <div className="vz-alert err">Colonnes obligatoires absentes : {parsed.missing.join(", ")}.</div>
            </div>
          )}
          <div className="vz-tablewrap">
            <table className="vz-table">
              <thead><tr><th>Ligne</th><th>Titulaire</th><th>E-mail</th><th>Certification</th><th>Émission</th><th>État</th></tr></thead>
              <tbody>
                {parsed.items.map((it) => (
                  <tr key={it.line}>
                    <td className="vz-mono vz-small vz-muted">{it.line}</td>
                    <td>{it.prenom} {it.nom}</td>
                    <td className="vz-small vz-muted">{it.email}</td>
                    <td className="vz-mono vz-small">{it.code}</td>
                    <td className="vz-mono vz-small">{it.issue}</td>
                    <td className="vz-small">
                      {it.errs.length > 0 ? <span style={{ color: "var(--rouge)" }}>{it.errs.join(" · ")}</span>
                        : it.dup ? <span style={{ color: "var(--orange)" }}>{it.dup}</span>
                        : <span style={{ color: "var(--vert)" }}>Prêt</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="vz-card-head" style={{ borderTop: "1px solid var(--trait)", borderBottom: 0 }}>
            <span className="vz-small vz-muted">{okCount} ligne{okCount > 1 ? "s prêtes" : " prête"} à l'import · {parsed.items.length - okCount} écartée{parsed.items.length - okCount > 1 ? "s" : ""}</span>
            <button className="vz-btn vz-btn-primary" disabled={busy || okCount === 0 || parsed.missing.length > 0} onClick={commit}>
              {busy ? "Création en cours…" : `Créer ${okCount} certificat${okCount > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export { AdminImport };
