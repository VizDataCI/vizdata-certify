/* Accueil : recherche par référence. */

import { useState } from "react";
import { PublicShell } from "./PublicShell.jsx";

function Home(p) {
  const [ref, setRef] = useState("");
  const submit = () => {
    if (!ref.trim()) return;
    p.go({ view: "verify", prefill: ref });
  };
  return (
    <PublicShell {...p}>
      <div className="vz-hero">
        <div className="vz-eyebrow" style={{ marginBottom: 14 }}>Registre officiel des certifications</div>
        <h1>VIZDATA CERTIFY</h1>
        <p>Plateforme officielle de vérification des certificats VIZDATA. Saisissez une référence ou scannez le QR code figurant sur le certificat.</p>
        <div className="vz-searchbox">
          <input
            className="vz-input"
            placeholder="VIZ-2026-EXCEL-000125"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            aria-label="Référence du certificat"
          />
          <button className="vz-btn vz-btn-primary vz-btn-lg" onClick={submit}>Vérifier</button>
        </div>
        <div className="vz-hero-actions" style={{ marginTop: 18 }}>
          <button className="vz-linkbtn" onClick={() => p.go({ view: "verify" })}>Page de vérification</button>
          <button className="vz-linkbtn" onClick={() => p.go({ view: "login" })}>Accéder à mon espace</button>
        </div>
      </div>
    </PublicShell>
  );
}

export { Home };
