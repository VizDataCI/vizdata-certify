/* Composants d'interface partagés.
 *
 * Ce qui est ici est utilisé partout : un indicateur, un badge de statut, un
 * champ, une modale, un graphique. Les écrans les assemblent sans redéfinir ni
 * marges ni couleurs, ce qui est la seule façon de garder quinze écrans
 * cohérents sans les relire tous à chaque retouche.
 */

import { useEffect } from "react";
import { STATUS_META } from "../lib/certificates.js";
import { VizdataMark } from "./VizdataLogo.jsx";
import { IconeFermer } from "./icones.jsx";

const Mark = ({ sub = "CERTIFY" }) => (
  <div className="vz-mark">
    <VizdataMark size={23} />
    <div className="vz-mark-word">vizdata</div>
    <div className="vz-mark-div" />
    <div className="vz-mark-text">{sub}</div>
  </div>
);

/**
 * En-tête des formulaires publics.
 *
 * Connexion, vérification, mot de passe : trois écrans qui s'ouvrent au même
 * endroit de la page et qui doivent se ressembler. Le sceau porte le logo
 * VIZDATA plutôt qu'un pictogramme : c'est à la marque qu'on confie une
 * référence de certificat ou un mot de passe, pas à un cadenas.
 */
const EnteteForm = ({ titre, children }) => (
  <div style={{ textAlign: "center", marginBottom: 22 }}>
    <div className="vz-sceau"><VizdataMark size={25} /></div>
    <h2 style={{ fontSize: 22, margin: "16px 0 6px", letterSpacing: "-.02em" }}>{titre}</h2>
    {children && (
      <p className="vz-small vz-muted" style={{ lineHeight: 1.6, maxWidth: 330, margin: "0 auto" }}>
        {children}
      </p>
    )}
  </div>
);

/* Un statut inconnu ne doit pas faire tomber l'écran : la base peut gagner une
   valeur d'énuméré avant que l'application ne la connaisse. */
const Badge = ({ status }) => {
  const m = STATUS_META[status] || { tone: "gris", label: status || "Inconnu" };
  return <span className={"vz-badge " + m.tone}>{m.label}</span>;
};

const Field = ({ label, children, hint }) => (
  <div className="vz-field">
    <label className="vz-label">{label}</label>
    {children}
    {hint && <span className="vz-small vz-muted">{hint}</span>}
  </div>
);

/**
 * Indicateur chiffré.
 *
 * L'icône n'est pas un ornement : sur une rangée de huit cartes qui se
 * ressemblent, c'est elle qu'on retrouve d'un coup d'œil, pas le libellé.
 * Sa teinte reprend celle du chiffre, pour que l'œil associe les deux.
 *
 * L'icône est posée à côté du chiffre, et non à côté du libellé. Sur une
 * rangée de huit cartes, chacune fait moins de 120 pixels : partagée avec
 * l'icône, la ligne du libellé ne laissait plus la place d'écrire
 * « Certifications », qui débordait de la carte. Le chiffre, lui, tient en
 * deux ou trois caractères et lui laisse volontiers la moitié de la ligne.
 *
 * `ton` prend : bleu (défaut), violet, orange, vert, rouge, gris.
 */
const Stat = ({ label, value, sub, icone: Icone, ton = "bleu" }) => (
  <div className={"vz-stat vz-apparait t-" + ton}>
    <div className="vz-stat-label">{label}</div>
    <div className="vz-stat-ligne">
      <div className="vz-stat-val" style={{ color: COULEUR_TON[ton] }}>{value}</div>
      {Icone && <span className={"vz-stat-icone " + ton}><Icone size={15} /></span>}
    </div>
    {sub && <div className="vz-stat-sub">{sub}</div>}
  </div>
);

const COULEUR_TON = {
  bleu: "var(--bleu)",
  violet: "var(--violet)",
  orange: "var(--orange)",
  vert: "var(--vert)",
  rouge: "var(--rouge)",
  gris: "var(--encre)",
};

/**
 * État vide.
 *
 * Un tableau sans ligne doit dire ce qui manque et ce qu'on peut faire. Un
 * écran qui se contente de rester blanc laisse croire à une panne.
 */
const Vide = ({ icone: Icone, titre, children, action }) => (
  <div className="vz-empty">
    {Icone && <div className="vz-empty-icone"><Icone size={22} /></div>}
    {titre && <h4>{titre}</h4>}
    {children && <div style={{ maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>{children}</div>}
    {action && <div style={{ marginTop: 16 }}>{action}</div>}
  </div>
);

/* Largeurs nommées plutôt que des nombres semés dans les écrans : « la modale
   du certificat » est une décision de mise en page, pas un pixel. Le certificat
   demande 1123 px pour s'afficher sans réduction sur un grand écran ; au-dessous
   il est simplement mis à l'échelle. */
const LARGEURS_MODALE = { normal: 660, large: 900, certificat: 1180 };

function Modal({ title, onClose, children, foot, wide, taille }) {
  const largeur = LARGEURS_MODALE[taille] || (wide ? LARGEURS_MODALE.large : LARGEURS_MODALE.normal);

  /* Échap ferme : une modale qui ne se ferme qu'au clic enferme l'utilisateur
     au clavier. */
  useEffect(() => {
    const auClavier = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [onClose]);

  return (
    <div className="vz-modal-bg" onClick={onClose}>
      {/* La taille nomme aussi la modale : « certificat » devient
          `vz-modal-certificat`, qui permet d'habiller cette fenêtre-là sans
          toucher aux vingt autres. Sans ce crochet, la seule façon de
          distinguer la fenêtre du certificat aurait été une largeur en ligne,
          qu'aucune feuille de style ne peut viser. */}
      <div
        className={"vz-modal" + (taille ? " vz-modal-" + taille : "")}
        style={{ maxWidth: largeur }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="vz-modal-head">
          <h3>{title}</h3>
          <button className="vz-btn vz-btn-ghost vz-btn-sm" onClick={onClose} aria-label="Fermer">
            <IconeFermer size={16} />
          </button>
        </div>
        <div className="vz-modal-body">{children}</div>
        {foot && <div className="vz-modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

/**
 * Histogramme.
 *
 * Les barres montent l'une après l'autre, très vite : le décalage rend la
 * progression lisible sans retarder la lecture. Au-delà de douze barres il
 * s'arrête, pour qu'une série longue n'étire pas l'animation.
 */
function BarChart({ data, alt }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div>
      <div className="vz-bars">
        {data.map((d, i) => (
          <div
            key={i}
            className={"vz-bar" + (alt ? " alt" : "")}
            style={{ height: `${(d.v / max) * 100}%`, animationDelay: `${Math.min(i, 12) * 28}ms` }}
            title={`${d.k} : ${d.v}`}
          />
        ))}
      </div>
      <div className="vz-barlab">
        {data.map((d, i) => <span key={i}>{d.k}</span>)}
      </div>
    </div>
  );
}

export { Mark, EnteteForm, Badge, Field, Stat, Vide, Modal, BarChart };
