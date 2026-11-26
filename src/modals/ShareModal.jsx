/* Partage : le lien pointe vers la vérification, jamais vers le fichier. */

import { typeCertificat } from "../lib/certificates.js";
import { QRCode } from "../ui/QRCode.jsx";
import { Modal } from "../ui/primitives.jsx";
import { IconeLien } from "../ui/icones.jsx";

/**
 * L'adresse qui remplit la rubrique « Licences et certifications » de LinkedIn.
 *
 * Ce n'est pas un partage : partager publie un message dans un fil, qui descend
 * et disparaît. Ceci inscrit la certification dans le profil, durablement, avec
 * le numéro de référence et l'adresse de vérification. Un recruteur qui lit le
 * profil six mois plus tard tombe donc sur le registre VIZDATA.
 *
 * Les paramètres sont ceux que LinkedIn documente pour `startTask=CERTIFICATION_NAME`.
 * Le mois et l'année sont séparés, et LinkedIn attend des nombres.
 */
function adresseLinkedIn(cert, url) {
  const date = new Date(cert.issue_date);
  const parametres = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    /* Un certificat de participation inscrit sous le seul nom du programme se
       lirait, sur un profil, comme une compétence validée. La mention voyage
       donc avec l'intitulé : la page de vérification fait foi, mais personne ne
       la rouvre une fois la ligne inscrite. */
    name: typeCertificat(cert.kind).competences
      ? cert.certification
      : `${cert.certification} (participation)`,
    organizationName: cert.issuer || "VIZDATA",
    certUrl: url,
    certId: cert.reference,
  });
  if (!Number.isNaN(date.getTime())) {
    parametres.set("issueYear", String(date.getFullYear()));
    parametres.set("issueMonth", String(date.getMonth() + 1));
  }
  return `https://www.linkedin.com/profile/add?${parametres.toString()}`;
}

function ShareModal({ cert, onClose, ...p }) {
  const url = p.verifyUrl(cert);
  const msg = `Je suis heureux de partager ma certification VIZDATA.\n\nCertification : ${cert.certification}\nType : ${typeCertificat(cert.kind).label}\nRéférence : ${cert.reference}\n\nVérifier mon certificat :\n${url}`;

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

      {/* Mis en avant, et séparé des boutons de partage : ce geste-là ne publie
          pas un message, il inscrit la certification dans le profil. C'est le
          seul qui travaille encore dans six mois. */}
      {cert.status === "ACTIVE" && (
        <div className="vz-linkedin">
          <div style={{ minWidth: 0 }}>
            <div className="vz-label" style={{ marginBottom: 3 }}>Ajouter à mon profil LinkedIn</div>
            <p className="vz-small vz-muted" style={{ margin: 0, lineHeight: 1.6 }}>
              La certification s'inscrit dans vos « Licences et certifications », avec sa référence
              et le lien de vérification. Elle reste visible en permanence, là où un message se perd.
            </p>
          </div>
          <button
            className="vz-btn vz-btn-primary"
            style={{ flex: "0 0 auto" }}
            onClick={() => open(adresseLinkedIn(cert, url), "linkedin_profil")}
          >
            <IconeLien size={16} /> Ajouter
          </button>
        </div>
      )}

      <div className="vz-eyebrow">Message proposé</div>
      <textarea className="vz-textarea" readOnly value={msg} style={{ marginTop: 8 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <button className="vz-btn" onClick={() => open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, "linkedin")}>LinkedIn</button>
        <button className="vz-btn" onClick={() => open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "whatsapp")}>WhatsApp</button>
        <button className="vz-btn" onClick={() => open(`mailto:?subject=${encodeURIComponent("Ma certification VIZDATA : " + cert.certification)}&body=${encodeURIComponent(msg)}`, "email")}>E-mail</button>
        <button className="vz-btn" onClick={() => { countShare("copy_link"); copy(url, "Lien copié."); }}>Copier le lien</button>
      </div>
      <div style={{ marginTop: 20, display: "flex", gap: 16, alignItems: "center", borderTop: "1px solid var(--trait)", paddingTop: 16 }}>
        <QRCode value={url} size={160} />
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
