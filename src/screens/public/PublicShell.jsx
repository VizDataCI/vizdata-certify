/* Coquille des écrans publics.
 *
 * La barre est blanche et translucide partout, SAUF au-dessus d'une scène en
 * fond sombre : elle y deviendrait une bande claire en travers de l'image, et
 * couperait en deux ce qui doit se lire d'un bloc. Au-dessus d'une scène, elle
 * se pose donc par-dessus, sans fond, et ne reprend son filet qu'au défilement
 * - c'est l'écran qui le demande, par la classe `transparent`.
 */

import { estAdministration } from "../../lib/permissions.js";
import { Mark } from "../../ui/primitives.jsx";

function PublicShell({ go, session, children, transparent = false }) {
  return (
    <div className={"vz-public" + (transparent ? " vz-public-scene" : "")}>
      <header className={"vz-public-bar" + (transparent ? " clair" : "")}>
        <button onClick={() => go({ view: "home" })} aria-label="Accueil VIZDATA CERTIFY"><Mark /></button>
        <nav className="vz-public-nav" aria-label="Navigation">
          <button className="vz-linkbtn" onClick={() => go({ view: "verify" })}>Vérifier</button>
          <button className="vz-linkbtn vz-lien-apropos" onClick={() => go({ view: "about" })}>À propos</button>
          {session ? (
            <button
              className="vz-btn vz-btn-sm"
              onClick={() => go(estAdministration(session) ? { view: "admin", page: "dashboard" } : { view: "dashboard" })}
            >
              Mon espace
            </button>
          ) : (
            <button className="vz-btn vz-btn-sm" onClick={() => go({ view: "login" })}>Se connecter</button>
          )}
        </nav>
      </header>
      {children}
    </div>
  );
}

export { PublicShell };
