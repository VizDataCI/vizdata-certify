/* Coquille des espaces authentifiés : barre latérale, navigation, entête.
 *
 * Deux navigations, pour une seule liste
 * -------------------------------------
 * La barre latérale disparaît sous 860 px. Elle laissait l'espace
 * d'administration et l'espace du titulaire SANS AUCUNE navigation sur
 * téléphone : une fois entré, on ne pouvait plus changer d'écran. Le même
 * tableau alimente donc une seconde navigation, horizontale et défilante, qui
 * ne s'affiche que là où la barre latérale est masquée. Une liste, deux
 * rendus : rien ne peut diverger.
 *
 * Chaque entrée porte son icône. Ce n'est pas décoratif : à la dixième visite,
 * on ne lit plus les libellés, on vise la forme. Une navigation sans icônes
 * oblige à relire la liste entière à chaque fois.
 */

import { Mark } from "./primitives.jsx";
import { IconeDeconnexion, IconeVerification } from "./icones.jsx";

/** Initiales du compte, pour la pastille. Deux lettres au maximum. */
function initiales(session) {
  const a = (session.first_name || "").trim()[0] || "";
  const b = (session.last_name || "").trim()[0] || "";
  return (a + b).toUpperCase() || (session.email || "?")[0].toUpperCase();
}

function AppShell({ nav, current, onNav, session, go, logout, title, children, sub, accent, onCompte }) {
  const onglets = nav.filter((n) => n.key);

  return (
    <div className="vz-app">
      <aside className="vz-side">
        <button className="vz-side-mark" onClick={() => go({ view: "home" })} aria-label="Accueil VIZDATA CERTIFY">
          <Mark sub={sub} />
        </button>

        <nav className="vz-nav" aria-label="Navigation principale">
          {nav.map((n) =>
            n.group ? (
              <div key={n.group} className="vz-nav-group">{n.group}</div>
            ) : (
              <button
                key={n.key}
                className={current === n.key ? "on" : ""}
                /* Une entrée de navigation change d'écran DANS l'espace
                   courant, sans exception. Une entrée a un temps pu mener
                   ailleurs — « Ma sécurité » renvoyait de l'administration
                   vers /espace — et c'était faux deux fois : on quittait
                   l'espace sans l'avoir demandé, et la navigation horizontale
                   du téléphone, qui ne connaît que `onNav`, n'affichait rien
                   du tout. Chaque espace héberge donc ses propres écrans. */
                onClick={() => onNav(n.key)}
                aria-current={current === n.key ? "page" : undefined}
              >
                {n.icone ? <n.icone /> : null}
                {n.label}
              </button>
            )
          )}
        </nav>

        <div className="vz-nav-compte">
          <div className={"vz-avatar" + (accent === "violet" ? " violet" : "")}>{initiales(session)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="vz-small" style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {session.first_name} {session.last_name}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", whiteSpace: "nowrap" }}>
              {/* Mot de passe et validation en deux étapes. Chaque espace
                  affiche l'écran chez lui et dit par où y aller : ce bouton ne
                  navigue donc pas, il change d'écran. Il menait auparavant à
                  l'espace du certifié, ce qui faisait sortir l'administrateur
                  de l'administration — barre, titre et adresse compris. */}
              <button
                className="vz-linkbtn"
                style={{ padding: 0, color: "var(--gris)", fontSize: 12 }}
                onClick={onCompte}
              >
                Mon compte
              </button>
              <button
                className="vz-linkbtn"
                style={{ padding: 0, color: "var(--gris)", fontSize: 12 }}
                onClick={logout}
              >
                Déconnexion
              </button>
            </div>
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
            <button className="vz-btn vz-btn-sm vz-topbar-verif" onClick={() => go({ view: "verify" })}>
              <IconeVerification size={15} />
              Vérifier un certificat
            </button>
            <button className="vz-btn vz-btn-sm" onClick={logout}>
              <IconeDeconnexion size={15} />
              Déconnexion
            </button>
          </div>
        </div>

        <nav className="vz-tabbar" aria-label="Navigation">
          {onglets.map((n) => (
            <button
              key={n.key}
              className={current === n.key ? "on" : ""}
              onClick={() => onNav(n.key)}
              aria-current={current === n.key ? "page" : undefined}
            >
              {n.icone ? <n.icone size={16} /> : null}
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
