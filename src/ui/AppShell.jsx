/* Coquille des espaces authentifiés : barre latérale, navigation, entête. */

import { Mark } from "./primitives.jsx";

function AppShell({ nav, current, onNav, session, go, logout, title, children, sub }) {
  return (
    <div className="vz-app">
      <aside className="vz-side">
        <button onClick={() => go({ view: "home" })} style={{ padding: "0 6px" }}><Mark sub={sub} /></button>
        <nav className="vz-nav">
          {nav.map((n) =>
            n.group ? (
              <div key={n.group} className="vz-nav-group">{n.group}</div>
            ) : (
              <button key={n.key} className={current === n.key ? "on" : ""} onClick={() => onNav(n.key)}>
                <span className="vz-dot" />{n.label}
              </button>
            )
          )}
        </nav>
        <div style={{ marginTop: "auto" }}>
          <div style={{ padding: "10px", borderTop: "1px solid var(--trait)" }}>
            <div className="vz-small" style={{ fontWeight: 500 }}>{session.first_name} {session.last_name}</div>
            <div className="vz-small vz-muted" style={{ marginTop: 2, wordBreak: "break-all" }}>{session.email}</div>
            <button className="vz-linkbtn" style={{ marginTop: 8, padding: 0 }} onClick={logout}>Déconnexion</button>
          </div>
        </div>
      </aside>
      <main className="vz-main">
        <div className="vz-topbar">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="vz-eyebrow">{title}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="vz-btn vz-btn-sm" onClick={() => go({ view: "verify" })}>Vérifier un certificat</button>
            <button className="vz-btn vz-btn-sm" onClick={logout}>Déconnexion</button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

export { AppShell };
