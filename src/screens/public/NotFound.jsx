/* Adresse inconnue.

   Volontairement sobre : un registre officiel ne plaisante pas sur une page
   introuvable, et l'on ne dit rien de ce qui existe ou non à cette adresse. */

import { PublicShell } from "./PublicShell.jsx";

function NotFound(p) {
  return (
    <PublicShell {...p}>
      <div className="vz-public-body">
        <div className="vz-slip" style={{ maxWidth: 480 }}>
          <div className="vz-verdict" style={{ borderBottom: 0 }}>
            <div className="vz-verdict-icon" style={{ background: "var(--gris)" }}>?</div>
            <div>
              <h2>Page introuvable</h2>
              <p>Cette adresse ne correspond à aucune page du registre VIZDATA.</p>
            </div>
          </div>
          <div className="vz-slip-actions">
            <button className="vz-btn vz-btn-primary" onClick={() => p.go({ view: "verify" })}>Vérifier un certificat</button>
            <button className="vz-btn" onClick={() => p.go({ view: "home" })}>Accueil</button>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

export { NotFound };
