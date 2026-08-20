/* À propos du registre. */

import { PublicShell } from "./PublicShell.jsx";

function About(p) {
  return (
    <PublicShell {...p}>
      <div className="vz-public-body">
        <div className="vz-slip">
          <div className="vz-card-body" style={{ padding: 26 }}>
            <div className="vz-eyebrow">À propos</div>
            <h2 style={{ fontSize: 19, margin: "10px 0 14px" }}>La preuve numérique de vos certifications</h2>
            <p style={{ color: "var(--gris)", fontSize: 14, lineHeight: 1.65 }}>
              VIZDATA CERTIFY est la plateforme officielle de gestion et de vérification des certificats délivrés par VIZDATA.
            </p>
            <p style={{ color: "var(--gris)", fontSize: 14, lineHeight: 1.65, marginTop: 12 }}>
              Chaque certificat porte une référence unique et un QR code qui renvoie vers sa page de vérification. Le statut affiché sur cette page fait foi : un certificat révoqué ou expiré n'y apparaît jamais comme valide.
            </p>
            <p style={{ color: "var(--gris)", fontSize: 14, lineHeight: 1.65, marginTop: 12 }}>
              La vérification est gratuite et ne demande aucun compte.
            </p>
            <button className="vz-btn" style={{ marginTop: 20 }} onClick={() => p.go({ view: "verify" })}>Vérifier un certificat</button>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

export { About };
