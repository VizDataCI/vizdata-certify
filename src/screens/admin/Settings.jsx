/* Paramètres de la plateforme.
 *
 * Le catalogue des certifications a quitté cet écran : domaines et programmes
 * se gèrent désormais dans « Domaines & programmes ». Ce qui reste ici est
 * ce qui vaut pour toute la plateforme — l'émetteur, l'adresse de
 * vérification, le format des références — plus le diagnostic de la
 * configuration, qui est la première chose qu'on vient chercher quand quelque
 * chose ne fonctionne pas.
 */

import { useEffect, useState } from "react";
import { resetDb } from "../../data/store.js";
import { lire, poster } from "../../lib/registre.js";
import { Field } from "../../ui/primitives.jsx";

function AdminSettings(p) {
  const [confirmer, setConfirmer] = useState(false);

  const reinitialiser = () => {
    p.setDb(resetDb());
    setConfirmer(false);
    p.notify("Registre réinitialisé au jeu de démonstration.");
  };

  const modeles = p.db.templates || [];
  const notifications = p.db.notifications || [];
  const envoisRates = notifications.filter((n) => n.status === "PENDING" || n.status === "FAILED").length;

  return (
    <>
      <div className="vz-page-head">
        <div>
          <div className="vz-eyebrow">Configuration</div>
          <h1 style={{ marginTop: 8 }}>Paramètres</h1>
        </div>
      </div>

      {/* --- diagnostic ---------------------------------------------------- */}
      <div className="vz-card" style={{ marginBottom: 16 }}>
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>État de la plateforme</h3></div>
        <div className="vz-tablewrap">
          <table className="vz-table">
            <tbody>
              <Ligne
                quoi="Base de données"
                etat={p.remote ? "ok" : "warn"}
                valeur={p.remote ? "Registre SQLite du serveur" : "Registre local du navigateur"}
                detail={p.remote
                  ? "Les écritures sont réellement enregistrées, et chaque droit est vérifié par le serveur avant la première ligne écrite."
                  : "Mode démonstration : les données vivent dans ce navigateur et ne sont partagées avec personne."}
              />
              <Ligne
                quoi="Authentification"
                etat={p.remote ? "ok" : "warn"}
                valeur={p.remote ? "Registre VIZDATA" : "Simulée"}
                detail={p.remote
                  ? "Les mots de passe ne sont jamais stockés : seule leur empreinte l'est, et elle ne permet pas de les retrouver."
                  : "Aucun mot de passe n'est vérifié tant que le registre du serveur n'est pas joignable."}
              />
              <Ligne
                quoi="Envoi des notifications"
                etat={!p.remote ? "warn" : envoisRates === 0 && notifications.length > 0 ? "ok" : "info"}
                valeur={!p.remote ? "Simulé" : notifications.length === 0 ? "Aucun envoi encore effectué" : `${notifications.length} envoi${notifications.length > 1 ? "s" : ""}, ${envoisRates} en souffrance`}
                detail="Tous les courriers partent du serveur — invitations, réinitialisations, attributions, candidatures. Ce qui n'est pas parti reste visible dans « Notifications » : un envoi perdu ne doit pas être un envoi oublié."
              />
              <Ligne
                quoi="Modèles de certificat"
                etat="ok"
                valeur={modeles.length > 0 ? modeles.map((m) => m.name).join(", ") : "Modèle officiel VIZDATA"}
                detail="A4 paysage. Le modèle utilisé est figé à la délivrance : un certificat s'imprime comme au jour où il a été délivré."
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* --- identité du registre ------------------------------------------ */}
      <div className="vz-card" style={{ marginBottom: 16 }}>
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Registre</h3></div>
        <div className="vz-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Organisme émetteur">
            <input className="vz-input" defaultValue="VIZDATA" readOnly style={{ background: "var(--surface)" }} />
          </Field>
          <Field label="Adresse de vérification" hint="Celle imprimée sur les certificats, sous le QR code.">
            <input className="vz-input vz-mono" defaultValue="certify.vizdata.ci/verifier" readOnly style={{ background: "var(--surface)" }} />
          </Field>
          <Field label="Format de référence" hint="Le code du programme en fait partie : le changer après une délivrance désaccorderait les références imprimées.">
            <input className="vz-input vz-mono" defaultValue="VIZ-{ANNÉE}-{CODE-PROGRAMME}-{NUMÉRO}" readOnly style={{ background: "var(--surface)" }} />
          </Field>
          <div className="vz-alert info">
            Les certificats délivrés depuis novembre 2026 sont sans date d'expiration et sans score : ces
            deux mentions ne figurent ni sur le document, ni dans l'espace du certifié, ni sur la page
            publique de vérification. Les certificats anciens qui en portent les conservent, en l'état.
          </div>
        </div>
      </div>

      {/* --- sauvegardes ---------------------------------------------------- */}
      {p.remote && <CarteSauvegardes notify={p.notify} />}

      {/* --- démonstration -------------------------------------------------- */}
      {!p.remote && (
        <div className="vz-card">
          <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Données de démonstration</h3></div>
          <div className="vz-card-body">
            <p className="vz-small vz-muted" style={{ margin: "0 0 12px", lineHeight: 1.7 }}>
              Le registre est conservé dans le stockage de ce navigateur. La réinitialisation efface les
              modifications locales et restaure le jeu de démonstration — domaines, programmes, comptes et
              certificats d'exemple.
            </p>
            {confirmer ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="vz-btn vz-btn-danger" onClick={reinitialiser}>Confirmer la réinitialisation</button>
                <button className="vz-btn" onClick={() => setConfirmer(false)}>Annuler</button>
              </div>
            ) : (
              <button className="vz-btn" onClick={() => setConfirmer(true)}>Réinitialiser le registre</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* --- sauvegardes -----------------------------------------------------------
   Pourquoi cette carte existe
   ---------------------------
   Une tâche planifiée sauvegarde chaque nuit, et c'est l'essentiel. Mais elle
   ne se voit pas : rien, dans l'application, ne disait si elle tournait. Une
   sauvegarde qu'on croit faite est pire qu'une sauvegarde qu'on sait absente.

   Cette carte montre donc ce qui existe réellement sur le serveur, et permet
   d'en déclencher une avant une manipulation délicate — un import en masse,
   une révocation, une mise à jour.

   Ce qu'elle ne fait PAS : restaurer. La restauration remplace le registre
   officiel de VIZDATA et ne se rattrape pas ; elle passe par
   `POST /api/sauvegardes/restaurer`, qui montre d'abord ce que contient la
   sauvegarde et n'applique rien sans confirmation explicite. Ce n'est pas un
   geste à mettre à portée d'un clic distrait. */

const poids = (o) =>
  o < 1024 * 1024 ? `${Math.round(o / 1024)} ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`;

const quand = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
};

function CarteSauvegardes({ notify }) {
  const [liste, setListe] = useState(null);
  const [panne, setPanne] = useState("");
  const [encours, setEncours] = useState(false);
  /* Relu à chaque incrément — après une sauvegarde manuelle. */
  const [tour, setTour] = useState(0);
  /* L'instant de la lecture est retenu plutôt que relu au rendu : l'heure
     n'est pas une donnée du rendu, et la relire à chaque passage ferait
     changer l'affichage sans qu'aucune donnée n'ait bougé. */
  const [lu, setLu] = useState(0);

  useEffect(() => {
    let vivant = true;
    lire("/sauvegardes")
      .then((l) => { if (vivant) { setListe(l); setLu(Date.now()); setPanne(""); } })
      .catch((e) => { if (vivant) { setListe([]); setPanne(e.message); } });
    return () => { vivant = false; };
  }, [tour]);

  const sauvegarder = async () => {
    setEncours(true);
    setPanne("");
    try {
      const faite = await poster("/sauvegarde");
      if (notify) {
        notify(
          `Sauvegarde ${faite.nom} — ${poids(faite.taille)}, ` +
            `${faite.contenu.certificats} certificat${faite.contenu.certificats > 1 ? "s" : ""}, ` +
            `${faite.contenu.comptes} compte${faite.contenu.comptes > 1 ? "s" : ""}.`
        );
      }
      setTour((t) => t + 1);
    } catch (e) {
      setPanne(e.message);
    } finally {
      setEncours(false);
    }
  };

  const derniere = liste && liste.length > 0 ? liste[0] : null;
  /* Une sauvegarde de plus de 48 h signale une tâche planifiée qui ne tourne
     pas. Le dire ici, c'est la seule chance de s'en apercevoir à temps. */
  const vieille = derniere && lu - new Date(derniere.date).getTime() > 48 * 3600 * 1000;

  return (
    <div className="vz-card" style={{ marginBottom: 16 }}>
      <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Sauvegardes</h3></div>
      <div className="vz-card-body">
        <p className="vz-small vz-muted" style={{ margin: "0 0 14px", lineHeight: 1.7 }}>
          La copie est prise à chaud, vérifiée, chiffrée, et déposée hors du dossier web. Les trente
          dernières sont gardées. <strong>Téléchargez-en une de temps en temps</strong> : une
          sauvegarde qui ne quitte jamais le serveur protège des fausses manœuvres, pas d'une panne
          de disque.
        </p>

        {panne && <div className="vz-alert err" style={{ marginBottom: 12 }}>{panne}</div>}

        {liste === null ? (
          <p className="vz-small vz-muted" style={{ margin: 0 }}>Lecture des sauvegardes…</p>
        ) : liste.length === 0 ? (
          <div className="vz-alert warn" style={{ marginBottom: 12 }}>
            Aucune sauvegarde sur le serveur. C'est exactement la situation qui a coûté le registre
            précédent.
          </div>
        ) : (
          <>
            {vieille && (
              <div className="vz-alert warn" style={{ marginBottom: 12 }}>
                La dernière sauvegarde date du {quand(derniere.date)}. La tâche planifiée du panneau
                d'hébergement ne tourne probablement plus.
              </div>
            )}
            <div className="vz-tablewrap" style={{ marginBottom: 12 }}>
              <table className="vz-table">
                <thead>
                  <tr><th>Fichier</th><th>Date</th><th>Taille</th><th>État</th></tr>
                </thead>
                <tbody>
                  {liste.slice(0, 8).map((s) => (
                    <tr key={s.nom}>
                      <td className="vz-mono" style={{ fontSize: 12 }}>{s.nom}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{quand(s.date)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{poids(s.taille)}</td>
                      <td>
                        <span className={"vz-badge " + (s.chiffree ? "vert" : "orange")}>
                          {s.chiffree ? "Chiffrée" : "En clair"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {liste.length > 8 && (
              <p className="vz-small vz-muted" style={{ margin: "0 0 12px" }}>
                {liste.length - 8} sauvegarde{liste.length - 8 > 1 ? "s" : ""} plus ancienne
                {liste.length - 8 > 1 ? "s" : ""} non affichée{liste.length - 8 > 1 ? "s" : ""}.
              </p>
            )}
          </>
        )}

        <button className="vz-btn" onClick={sauvegarder} disabled={encours}>
          {encours ? "Sauvegarde en cours…" : "Sauvegarder maintenant"}
        </button>
      </div>
    </div>
  );
}

const TONS = { ok: "vert", warn: "orange", info: "gris", err: "rouge" };
const MOTS = { ok: "En place", warn: "À configurer", info: "À surveiller", err: "En échec" };

function Ligne({ quoi, etat, valeur, detail }) {
  return (
    <tr>
      <td style={{ fontWeight: 500, whiteSpace: "nowrap", verticalAlign: "top" }}>{quoi}</td>
      <td style={{ verticalAlign: "top" }}><span className={"vz-badge " + TONS[etat]}>{MOTS[etat]}</span></td>
      <td>
        <div style={{ fontSize: 13 }}>{valeur}</div>
        <div className="vz-small vz-muted" style={{ marginTop: 4, lineHeight: 1.6, maxWidth: 560 }}>{detail}</div>
      </td>
    </tr>
  );
}

export { AdminSettings };
