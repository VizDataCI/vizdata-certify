/* Composants d'interface partagés. */

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

const Badge = ({ status }) => {
  const m = STATUS_META[status];
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

function Modal({ title, onClose, children, foot, wide }) {
  return (
    <div className="vz-modal-bg" onClick={onClose}>
      <div className="vz-modal" style={wide ? { maxWidth: 860 } : null} onClick={(e) => e.stopPropagation()}>
        <div className="vz-modal-head">
          <h3 style={{ fontSize: 15 }}>{title}</h3>
          <button className="vz-linkbtn" onClick={onClose}>Fermer</button>
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
