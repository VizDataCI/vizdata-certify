/* Profil public d'un certifié.

   La fonction `public_profile` ne rend que les certifications en vigueur d'un
   titulaire ayant activé son profil. Un profil fermé et un titulaire inconnu
   renvoient tous deux une liste vide : la page ne distingue pas les deux cas,
   et c'est voulu — l'absence de réponse ne doit pas renseigner sur l'existence
   d'un compte. */

import { useState, useEffect } from "react";
import { PublicShell } from "./PublicShell.jsx";

function PublicProfile(p) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    p.findProfile(p.route.username)
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => { if (alive) { setErr(e.message); setRows([]); } });
    return () => { alive = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [p.route.username]);

  const shell = (children) => (
    <PublicShell {...p}>
      <div className="vz-public-body">{children}</div>
    </PublicShell>
  );

  if (rows === null) {
    return shell(
      <div className="vz-slip" style={{ maxWidth: 460 }}>
        <div className="vz-card-body" style={{ padding: 26 }}>
          <p className="vz-small vz-muted">Chargement du profil…</p>
        </div>
      </div>
    );
  }

  if (err) {
    return shell(
      <div className="vz-slip" style={{ maxWidth: 460 }}>
        <div className="vz-card-body" style={{ padding: 26 }}>
          <div className="vz-alert err">{err}</div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return shell(
      <div className="vz-slip" style={{ maxWidth: 460 }}>
        <div className="vz-card-body" style={{ padding: 26 }}>
          <h2 style={{ fontSize: 17 }}>Profil non public</h2>
          <p className="vz-small vz-muted" style={{ marginTop: 8 }}>
            Ce profil n'est pas accessible publiquement, ou ne présente aucune certification en vigueur.
          </p>
        </div>
      </div>
    );
  }

  const holder = rows[0].holder_name;

  return shell(
    <div className="vz-slip">
      <div className="vz-card-body" style={{ padding: 26, borderBottom: "1px solid var(--trait)" }}>
        <div className="vz-eyebrow">Profil certifié</div>
        <h2 style={{ fontSize: 22, marginTop: 9 }}>{holder}</h2>
        <p className="vz-small vz-muted" style={{ marginTop: 6 }}>
          {rows.length} certification{rows.length > 1 ? "s" : ""} en vigueur, délivrée{rows.length > 1 ? "s" : ""} par VIZDATA.
        </p>
      </div>
      {rows.map((r) => (
        <div key={r.reference} className="vz-dl-row" style={{ alignItems: "center" }}>
          <dt style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, color: "var(--encre)", fontSize: 13.5 }}>{r.certification}</div>
            <div className="vz-ref vz-small vz-muted" style={{ marginTop: 3 }}>{r.reference}</div>
          </dt>
          <dd style={{ flex: "0 0 auto" }}>
            <button className="vz-btn vz-btn-sm" onClick={() => p.go({ view: "verifyResult", token: r.public_token, source: "lien" })}>Vérifier</button>
          </dd>
        </div>
      ))}
    </div>
  );
}

export { PublicProfile };
