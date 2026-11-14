/* Coquille des espaces authentifiés : barre latérale, navigation, entête.
 *
 * Deux navigations, pour une seule liste
 * -------------------------------------
 * La barre latérale disparaît sous 860 px — c'est la règle de mise en page
 * historique. Elle laissait l'espace d'administration et l'espace du titulaire
 * SANS AUCUNE navigation sur téléphone : une fois entré, on ne pouvait plus
 * changer d'écran. Le même tableau alimente donc une seconde navigation,
 * horizontale et défilante, qui ne s'affiche que là où la barre latérale est
 * masquée. Une liste, deux rendus : rien ne peut diverger.
 */

import { Mark } from "./primitives.jsx";

function AppShell({ nav, current, onNav, session, go, logout, title, children, sub }) {
  const onglets = nav.filter((n) => n.key);

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
          <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
            {/* La marque n'est visible dans l'entête que sur petit écran, où la
                barre latérale qui la portait a disparu. */}
            <button className="vz-topbar-mark" onClick={() => go({ view: "home" })} aria-label="Accueil VIZDATA CERTIFY">
              <Mark sub={sub} />
            </button>
            <span className="vz-eyebrow vz-topbar-titre">{title}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="vz-btn vz-btn-sm vz-topbar-verif" onClick={() => go({ view: "verify" })}>Vérifier un certificat</button>
            <button className="vz-btn vz-btn-sm" onClick={logout}>Déconnexion</button>
          </div>
        </div>

        <nav className="vz-tabbar" aria-label="Navigation">
          {onglets.map((n) => (
            <button key={n.key} className={current === n.key ? "on" : ""} onClick={() => onNav(n.key)}>
              {n.label}
            </button>
          ))}
        </nav>

        {children}
      </main>
    </div>
  );
}

export { AppShell };
