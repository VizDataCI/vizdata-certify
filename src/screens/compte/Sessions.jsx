/* Les appareils où le compte est ouvert.
 *
 * Pourquoi cet écran existe
 * -------------------------
 * Une session se ferme en se déconnectant : depuis l'appareil où elle est
 * ouverte. Celui qui s'est connecté depuis un poste partagé et qui est parti
 * sans fermer n'avait donc aucun recours : la seule manière de couper était de
 * changer de mot de passe, et personne ne change de mot de passe pour cette
 * raison. La session restait ouverte des semaines.
 *
 * Un bouton, et il ne demande rien d'autre qu'un clic : fermer PARTOUT
 * AILLEURS. Pas de liste à cocher, pas de session à désigner : au moment où
 * l'on s'inquiète, on ne sait pas laquelle est la bonne, on sait seulement
 * qu'on veut être seul.
 *
 * La liste, elle, sert à comprendre : si elle montre un appareil qu'on ne
 * reconnaît pas, la question ne se pose plus.
 */

import { useState, useEffect } from "react";
import { fermerAutresSessions, mesSessions } from "../../lib/auth.js";
import { fmtDateHeure } from "../../lib/dates.js";
import { IconeAlerte, IconeDeconnexion, IconeVerrou } from "../../ui/icones.jsx";

function SessionsCarte({ notify }) {
  const [etat, setEtat] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const charger = () => {
    mesSessions()
      .then(setEtat)
      .catch((e) => setErr(e.message));
  };

  useEffect(charger, []);

  const fermer = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const { fermees } = await fermerAutresSessions();
      notify(
        fermees > 0
          ? `${fermees} autre${fermees > 1 ? "s" : ""} session${fermees > 1 ? "s" : ""} fermée${fermees > 1 ? "s" : ""}. Cet appareil reste connecté.`
          : "Aucune autre session n'était ouverte."
      );
      charger();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  if (etat?.indisponible) {
    return (
      <section className="vz-card" style={{ maxWidth: 560, marginTop: 18 }}>
        <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Appareils connectés</h3></div>
        <div className="vz-card-body">
          <p className="vz-small vz-muted">
            Indisponible en démonstration : aucune session n'est réellement ouverte.
          </p>
        </div>
      </section>
    );
  }

  const sessions = etat?.sessions || [];
  const autres = sessions.filter((s) => !s.courante).length;

  return (
    <section className="vz-card" style={{ maxWidth: 560, marginTop: 18 }}>
      <div className="vz-card-head"><h3 style={{ fontSize: 14 }}>Appareils connectés</h3></div>
      <div className="vz-card-body">
        <p className="vz-small vz-muted" style={{ lineHeight: 1.7, margin: 0 }}>
          Chaque connexion ouvre une session qui dure jusqu'à son expiration, même si vous fermez
          le navigateur. Si vous vous êtes connecté depuis un poste qui n'est pas le vôtre,
          fermez-le d'ici.
        </p>

        {err && <div className="vz-alert err" style={{ marginTop: 12 }}>{err}</div>}

        {/* La dernière tentative échouée, quand il y en a une. Elle ne dit pas
            qu'on est attaqué (un mot de passe se tape mal) mais elle donne
            une date, et c'est à partir d'une date qu'on s'inquiète à bon
            escient. */}
        {etat?.derniere_tentative_echouee && (
          <div className="vz-alert warn" style={{ marginTop: 12 }}>
            <IconeAlerte size={17} />
            <span>
              Dernière tentative de connexion échouée sur votre compte :{" "}
              <strong>{fmtDateHeure(etat.derniere_tentative_echouee)}</strong>.
            </span>
          </div>
        )}

        {etat === null && !err ? (
          <p className="vz-small vz-muted" style={{ marginTop: 12 }}>Lecture des sessions…</p>
        ) : (
          <ul className="vz-sessions">
            {sessions.map((s) => (
              <li key={s.id} className={"vz-session" + (s.courante ? " on" : "")}>
                <IconeVerrou size={16} />
                <div style={{ minWidth: 0 }}>
                  <div className="vz-session-nom">
                    {s.appareil}
                    {s.courante && <span className="vz-session-ici">Cet appareil</span>}
                  </div>
                  <div className="vz-session-date">
                    Ouverte le {fmtDateHeure(s.created_at)} · vue le {fmtDateHeure(s.last_seen)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          className="vz-btn vz-btn-form"
          onClick={fermer}
          disabled={busy || autres === 0}
          style={{ marginTop: 14 }}
        >
          <IconeDeconnexion size={15} />
          {busy
            ? "Fermeture…"
            : autres === 0
              ? "Aucune autre session ouverte"
              : autres === 1
                ? "Fermer l'autre session"
                : `Fermer les ${autres} autres sessions`}
        </button>
      </div>
    </section>
  );
}

export { SessionsCarte };
