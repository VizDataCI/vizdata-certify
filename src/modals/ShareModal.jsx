/* Partage : le lien pointe vers la vérification, jamais vers le fichier. */

import { QRCode } from "../ui/QRCode.jsx";
import { Modal } from "../ui/primitives.jsx";

function ShareModal({ cert, onClose, ...p }) {
  const url = p.verifyUrl(cert);
  const msg = `Je suis heureux de partager ma certification VIZDATA.\n\nCertification : ${cert.certification}\nRéférence : ${cert.reference}\n\nVérifier mon certificat :\n${url}`;

  /* Le comptage passe par record_share côté base : la table shares reste
     fermée à l'écriture, seule la fonction y insère. Un échec de comptage ne
     doit pas empêcher le partage lui-même. */
  const countShare = (platform) => { p.recordPublicShare(cert, platform).catch(() => {}); };

  const copy = (text, label) => {
    try {
      navigator.clipboard.writeText(text);
      p.notify(label);
    } catch (e) {
      p.notify("Copie impossible dans ce contexte.");
    }
  };

  const open = (u2, platform) => {
    countShare(platform);
    try { window.open(u2, "_blank", "noopener"); } catch (e) {}
  };

  return (
    <Modal title="Partager la certification" onClose={onClose} foot={<button className="vz-btn" onClick={onClose}>Fermer</button>}>
      <div className="vz-alert info" style={{ marginBottom: 16 }}>
        Le lien partagé pointe vers la page de vérification, jamais vers le fichier. Le statut affiché reste donc toujours à jour.
      </div>
      <div className="vz-eyebrow">Message proposé</div>
      <textarea className="vz-textarea" readOnly value={msg} style={{ marginTop: 8 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <button className="vz-btn" onClick={() => open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, "linkedin")}>LinkedIn</button>
        <button className="vz-btn" onClick={() => open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "whatsapp")}>WhatsApp</button>
        <button className="vz-btn" onClick={() => open(`mailto:?subject=${encodeURIComponent("Ma certification VIZDATA — " + cert.certification)}&body=${encodeURIComponent(msg)}`, "email")}>E-mail</button>
        <button className="vz-btn" onClick={() => { countShare("copy_link"); copy(url, "Lien copié."); }}>Copier le lien</button>
      </div>
      <div style={{ marginTop: 20, display: "flex", gap: 16, alignItems: "center", borderTop: "1px solid var(--trait)", paddingTop: 16 }}>
        <QRCode value={url} size={92} quiet={2} />
        <div>
          <div className="vz-eyebrow">Lien de vérification</div>
          <div className="vz-mono vz-small" style={{ marginTop: 6, wordBreak: "break-all" }}>{url}</div>
          <div className="vz-small vz-muted" style={{ marginTop: 6 }}>Titulaire : {cert.holder_name}</div>
        </div>
      </div>
    </Modal>
  );
}

export { ShareModal };
