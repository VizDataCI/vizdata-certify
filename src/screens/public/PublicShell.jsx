/* Coquille des écrans publics. */

import { Mark } from "../../ui/primitives.jsx";

function PublicShell({ go, session, children }) {
  return (
    <div className="vz-public">
      <div className="vz-public-bar">
        <button onClick={() => go({ view: "home" })} aria-label="Accueil VIZDATA CERTIFY"><Mark /></button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="vz-linkbtn" onClick={() => go({ view: "about" })}>À propos</button>
          {session ? (
            <button className="vz-btn vz-btn-sm" onClick={() => go({ view: session.role === "ADMIN" ? "admin" : "dashboard", page: "dashboard" })}>Mon espace</button>
          ) : (
            <button className="vz-btn vz-btn-sm" onClick={() => go({ view: "login" })}>Se connecter</button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export { PublicShell };
