/* Visuels de la page de vente.
 *
 * Deux briques seulement : un aperçu de tableau de bord, et une photographie
 * qui se replie proprement quand le fichier n'est pas encore déposé.
 *
 * L'aperçu est dessiné en SVG, pas capturé en image : il reste net sur un
 * écran haute densité, il pèse quelques kilo-octets, et il illustre ce que les
 * participants apprennent à produire sans emprunter la copie d'écran du
 * tableau de bord de quelqu'un d'autre.
 *
 * Les couleurs des marques de données ne sont pas prises au hasard dans la
 * charte : le bleu et le violet de la marque, côte à côte, sont
 * indiscernables pour une vision deutéranope (ΔE 3,5). Le trio retenu —
 * #1578A6, #D9700F, #7A4C9E — passe les six contrôles de séparation, de bande
 * de clarté et de contraste sur fond blanc. Le violet est éclairci et l'orange
 * assombri par rapport au logo : ce sont des marques de graphique, pas le
 * logo, qui lui reste intact.
 */

import { useState } from "react";

const BLEU = "#1578A6";
const ORANGE = "#D9700F";
const VIOLET = "#7A4C9E";
const TRAIT = "#E3E6EC";
const ENCRE_FAIBLE = "#8A93A3";

/* --- aperçu de tableau de bord -------------------------------------------- */

const MOIS = [
  { mois: "Jan", realise: 62, objectif: 58 },
  { mois: "Fév", realise: 71, objectif: 64 },
  { mois: "Mar", realise: 58, objectif: 70 },
  { mois: "Avr", realise: 83, objectif: 76 },
  { mois: "Mai", realise: 94, objectif: 82 },
  { mois: "Juin", realise: 88, objectif: 88 },
];

/** Barres groupées : réalisé contre objectif, sur six mois. */
function BarresGroupees() {
  const L = 268, H = 112, BAS = 18, HAUT = 10;
  const max = 100;
  const utile = H - BAS - HAUT;
  const pas = L / MOIS.length;
  /* Deux barres fines par mois, séparées de 2 px : l'écart fait le travail
     que ferait sinon une bordure. */
  const largeur = 9;

  const y = (v) => HAUT + utile - (v / max) * utile;

  return (
    <svg viewBox={`0 0 ${L} ${H}`} width="100%" height="112" role="img"
         aria-label="Réalisé contre objectif sur six mois : l'écart se referme à partir d'avril.">
      {[25, 50, 75, 100].map((g) => (
        <line key={g} x1="0" x2={L} y1={y(g)} y2={y(g)} stroke={TRAIT} strokeWidth="1" />
      ))}
      {MOIS.map((m, i) => {
        const centre = i * pas + pas / 2;
        return (
          <g key={m.mois}>
            <rect x={centre - largeur - 1} y={y(m.realise)} width={largeur} height={HAUT + utile - y(m.realise)}
                  rx="4" fill={BLEU}>
              <title>{`${m.mois} — réalisé ${m.realise}`}</title>
            </rect>
            <rect x={centre + 1} y={y(m.objectif)} width={largeur} height={HAUT + utile - y(m.objectif)}
                  rx="4" fill={ORANGE}>
              <title>{`${m.mois} — objectif ${m.objectif}`}</title>
            </rect>
            <text x={centre} y={H - 5} textAnchor="middle" fontSize="8.5" fill={ENCRE_FAIBLE}
                  fontFamily="'IBM Plex Sans',sans-serif">{m.mois}</text>
          </g>
        );
      })}
      {/* Une seule étiquette directe, sur le point qui porte le propos. */}
      <text x={4 * pas + pas / 2 - 6} y={y(94) - 4} textAnchor="middle" fontSize="9" fontWeight="600"
            fill="#101A2B" fontFamily="'IBM Plex Sans',sans-serif">94</text>
    </svg>
  );
}

/** Légende : l'identité ne repose jamais sur la couleur seule. */
function Legende() {
  return (
    <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
      {[["Réalisé", BLEU], ["Objectif", ORANGE]].map(([l, c]) => (
        <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#5A6475" }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: c, flex: "0 0 9px" }} />
          {l}
        </span>
      ))}
    </div>
  );
}

/** Anneau de progression : une seule valeur, donc aucune légende. */
function Anneau({ valeur = 87 }) {
  const R = 30, C = 2 * Math.PI * R;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg viewBox="0 0 80 80" width="86" height="86" role="img" aria-label={`Taux de réalisation : ${valeur} %`}>
        <circle cx="40" cy="40" r={R} fill="none" stroke="#EEF1F5" strokeWidth="8" />
        <circle cx="40" cy="40" r={R} fill="none" stroke={VIOLET} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${(valeur / 100) * C} ${C}`} transform="rotate(-90 40 40)" />
        <text x="40" y="44" textAnchor="middle" fontSize="17" fontWeight="600" fill="#101A2B"
              fontFamily="'Poppins',sans-serif">{valeur}%</text>
      </svg>
      <span style={{ fontSize: 10.5, color: "#5A6475" }}>Objectif annuel</span>
    </div>
  );
}

/** Aperçu complet, tel qu'un participant apprend à le construire. */
function ApercuTableauBord() {
  return (
    <div className="ac-visuel">
      <div className="ac-visuel-carte">
        <div className="ac-visuel-barre">
          <span className="ac-visuel-pt" /><span className="ac-visuel-pt" /><span className="ac-visuel-pt" />
          <span className="ac-visuel-titre">Suivi commercial — Power BI</span>
        </div>
        <div className="ac-visuel-corps">
          <div className="ac-visuel-kpis">
            <div className="ac-kpi">
              <div className="ac-kpi-lib">Chiffre d'affaires</div>
              <div className="ac-kpi-val">456 M</div>
              <div className="ac-kpi-delta hausse">▲ 12,4 %</div>
            </div>
            <div className="ac-kpi">
              <div className="ac-kpi-lib">Marge</div>
              <div className="ac-kpi-val">18,2 %</div>
              <div className="ac-kpi-delta hausse">▲ 1,8 pt</div>
            </div>
            <div className="ac-kpi">
              <div className="ac-kpi-lib">Délai moyen</div>
              <div className="ac-kpi-val">4,1 j</div>
              <div className="ac-kpi-delta baisse">▼ 0,6 j</div>
            </div>
          </div>
          <div className="ac-visuel-duo">
            <div className="ac-visuel-bloc">
              <h4>Réalisé contre objectif</h4>
              <BarresGroupees />
              <Legende />
            </div>
            <div className="ac-visuel-bloc" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Anneau />
            </div>
          </div>
        </div>
      </div>
      <div className="ac-flottant">
        <span className="ac-flottant-icone">XL</span>
        <span>Des données brutes au tableau de bord</span>
      </div>
    </div>
  );
}

/* --- photographie avec repli ---------------------------------------------- */

/**
 * Photographie de formateur ou de session.
 *
 * Les photographies officielles sont fournies par VIZDATA et déposées dans
 * public/academie/. Tant qu'un fichier manque, on affiche les initiales sur un
 * fond de marque — jamais une image cassée, et jamais un portrait de banque
 * d'images qui ferait passer un inconnu pour un formateur.
 */
function Photo({ src, alt, initiales, className = "ac-photo" }) {
  const [absente, setAbsente] = useState(!src);

  if (absente) {
    return (
      <div className="ac-photo-repli" role="img" aria-label={alt}>
        {initiales}
      </div>
    );
  }
  return (
    <img className={className} src={src} alt={alt} loading="lazy" decoding="async"
         onError={() => setAbsente(true)} />
  );
}

export { ApercuTableauBord, Photo };
