/* Saisie d'une référence à vérifier. */

import { useState, useEffect, useRef } from "react";
import { PublicShell } from "./PublicShell.jsx";

function VerifySearch(p) {
  const [ref, setRef] = useState(p.route.prefill || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const launched = useRef(false);

  const submit = async (value) => {
    const query = (value ?? ref).trim();
    if (!query || busy) return;
    setBusy(true);
    setErr("");
    try {
      const certificate = await p.findByReference(query);
      if (!certificate) {
        setErr("Aucun certificat ne correspond à cette référence. Vérifiez la saisie, tirets compris.");
        setBusy(false);
        return;
      }
      /* Le certificat déjà résolu voyage avec la route : la page n'a pas à
         redemander ce qu'elle vient d'obtenir, ce qui compterait une seconde
         consultation. L'adresse, elle, devient partageable. */
      p.go({ view: "verifyResult", token: certificate.public_token, certificate, source: "reference" });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  /* Référence arrivée depuis l'accueil : on vérifie sans faire ressaisir. */
  useEffect(() => {
    if (p.route.prefill && !launched.current) {
      launched.current = true;
      submit(p.route.prefill);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  return (
    <PublicShell {...p}>
      <div className="vz-public-body">
        <div className="vz-slip" style={{ maxWidth: 480 }}>
          <div className="vz-card-body" style={{ padding: 26 }}>
            <div className="vz-eyebrow">Vérification</div>
            <h2 style={{ fontSize: 19, margin: "10px 0 6px" }}>Vérifier un certificat</h2>
            <p className="vz-small vz-muted" style={{ marginBottom: 18 }}>Entrez la référence figurant sur le certificat.</p>
            <input
              className="vz-input"
              style={{ height: 44, fontFamily: "var(--mono)", letterSpacing: ".04em" }}
              placeholder="VIZ-2026-EXCEL-000125"
              value={ref}
              onChange={(e) => { setRef(e.target.value); setErr(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              aria-label="Référence du certificat"
            />
            {err && <div className="vz-alert err" style={{ marginTop: 12 }}>{err}</div>}
            <button className="vz-btn vz-btn-primary vz-btn-lg" style={{ width: "100%", marginTop: 14 }} onClick={() => submit()} disabled={busy}>
              {busy ? "Vérification…" : "Vérifier"}
            </button>
            <p className="vz-small vz-muted" style={{ marginTop: 16, lineHeight: 1.6 }}>
              Exemple de référence valide : <span className="vz-ref">VIZ-2026-EXCEL-000125</span>
            </p>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

export { VerifySearch };
