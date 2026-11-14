/* Composants d'interface partagés. */

import { useEffect } from "react";
import { STATUS_META } from "../lib/certificates.js";
import { VizdataMark } from "./VizdataLogo.jsx";

const Mark = ({ sub = "CERTIFY" }) => (
  <div className="vz-mark">
    <VizdataMark size={22} />
    <div className="vz-mark-word">vizdata</div>
    <div className="vz-mark-div" />
    <div className="vz-mark-text">{sub}</div>
  </div>
);

/* Un statut inconnu ne doit pas faire tomber l'écran : la base peut gagner une
   valeur d'énuméré avant que l'application ne la connaisse. */
const Badge = ({ status }) => {
  const m = STATUS_META[status] || { tone: "gris", label: status || "—" };
  return <span className={"vz-badge " + m.tone}>{m.label}</span>;
};

const Field = ({ label, children, hint }) => (
  <div className="vz-field">
    <label className="vz-label">{label}</label>
    {children}
    {hint && <span className="vz-small vz-muted">{hint}</span>}
  </div>
);

const Stat = ({ label, value, sub, accent }) => (
  <div className="vz-stat">
    <div className="vz-eyebrow">{label}</div>
    <div className="vz-stat-val" style={accent ? { color: accent } : null}>{value}</div>
    {sub && <div className="vz-stat-sub">{sub}</div>}
  </div>
);

/* Largeurs nommées plutôt que des nombres semés dans les écrans : « la modale
   du certificat » est une décision de mise en page, pas un pixel. Le certificat
   demande 1123 px pour s'afficher sans réduction sur un grand écran ; au-dessous
   il est simplement mis à l'échelle. */
const LARGEURS_MODALE = { normal: 660, large: 880, certificat: 1180 };

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
      <div className="vz-modal" style={{ maxWidth: largeur }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="vz-modal-head">
          <h3 style={{ fontSize: 15 }}>{title}</h3>
          <button className="vz-linkbtn" onClick={onClose} aria-label="Fermer">Fermer</button>
        </div>
        <div className="vz-modal-body">{children}</div>
        {foot && <div className="vz-modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

function BarChart({ data, alt }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div>
      <div className="vz-bars">
        {data.map((d, i) => (
          <div key={i} className={"vz-bar" + (alt ? " alt" : "")} style={{ height: `${(d.v / max) * 100}%` }} title={`${d.k} — ${d.v}`} />
        ))}
      </div>
      <div className="vz-barlab">
        {data.map((d, i) => <span key={i}>{d.k}</span>)}
      </div>
    </div>
  );
}

export { Mark, Badge, Field, Stat, Modal, BarChart };
