/* Accueil public.
 *
 * Cette page a un seul travail : permettre de vérifier un certificat en moins
 * de dix secondes, sans explication préalable. Le champ est donc au centre, en
 * grand, et tout le reste vient après.
 *
 * Les trois points sous la recherche décrivent le service, ils ne le vantent
 * pas : ce sont des faits vérifiables sur cette plateforme, pas des chiffres
 * d'effet. Un registre de certification qui se présenterait avec des
 * statistiques flatteuses perdrait exactement ce qu'il vend.
 */

import { useState } from "react";
import { REFERENCE_EXEMPLE } from "../../data/seed.js";
import { IconeQr, IconeAuthentique, IconeVerrou, IconeRecherche, IconeDroite } from "../../ui/icones.jsx";
import { PublicShell } from "./PublicShell.jsx";

const POINTS = [
  {
    icone: IconeRecherche,
    titre: "Vérification immédiate",
    texte: "Saisissez la référence imprimée sur le certificat, ou scannez son QR code.",
  },
  {
    icone: IconeAuthentique,
    titre: "Registre officiel",
    texte: "Chaque certification délivrée par VIZDATA y est enregistrée, avec sa date et son statut.",
  },
  {
    icone: IconeVerrou,
    titre: "Aucune donnée personnelle",
    texte: "La page de vérification montre le titre et le titulaire, jamais ses coordonnées.",
  },
];

function Home(p) {
  const [ref, setRef] = useState("");
  const submit = () => {
    if (!ref.trim()) return;
    p.go({ view: "verify", prefill: ref });
  };

  return (
    <PublicShell {...p}>
      <div className="vz-hero">
        <div className="vz-eyebrow" style={{ marginBottom: 16 }}>Registre officiel des certifications</div>
        <h1>Vérifiez un certificat VIZDATA</h1>
        <p>
          Toute certification délivrée par VIZDATA porte une référence unique et un QR code.
          L'une comme l'autre mènent ici.
        </p>
        <div className="vz-searchbox">
          <input
            className="vz-input"
            placeholder={REFERENCE_EXEMPLE}
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            aria-label="Référence du certificat"
          />
          <button className="vz-btn vz-btn-primary vz-btn-lg" onClick={submit}>
            <IconeRecherche size={17} /> Vérifier
          </button>
        </div>
        <div className="vz-hero-actions" style={{ marginTop: 20 }}>
          <button className="vz-linkbtn" style={{ display: "inline-flex", alignItems: "center", gap: 5 }} onClick={() => p.go({ view: "verify" })}>
            <IconeQr size={15} /> Page de vérification
          </button>
          <button className="vz-linkbtn" style={{ display: "inline-flex", alignItems: "center", gap: 5 }} onClick={() => p.go({ view: "login" })}>
            Accéder à mon espace <IconeDroite size={15} />
          </button>
        </div>
      </div>

      <div className="vz-points">
        {POINTS.map((x) => (
          <div key={x.titre} className="vz-point vz-apparait">
            <span className="vz-point-icone"><x.icone size={19} /></span>
            <h3>{x.titre}</h3>
            <p>{x.texte}</p>
          </div>
        ))}
      </div>
    </PublicShell>
  );
}

export { Home };
