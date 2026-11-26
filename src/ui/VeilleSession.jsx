/* La veille d'inactivité : dix minutes, dont les deux dernières annoncées.
 *
 * Pourquoi c'est l'ÉCRAN qui déconnecte
 * -------------------------------------
 * Le serveur ne voit que les requêtes. Quelqu'un qui lit une page pendant huit
 * minutes sans rien cliquer lui est indiscernable de quelqu'un qui est parti
 * déjeuner. S'il tranchait seul, il couperait au milieu d'une lecture.
 *
 * L'écran, lui, voit la souris, le clavier et le doigt. C'est donc lui qui
 * compte, et le serveur coupe deux minutes plus tard, en filet : pour le cas
 * où l'onglet serait fermé brutalement, où la machine serait mise en veille,
 * ou simplement où personne ne reviendrait.
 *
 * Le battement de cœur
 * --------------------
 * Tant qu'on travaille, l'écran prévient le serveur toutes les quatre minutes
 * que la session sert encore. Sans cela, lire une page pendant douze minutes
 * ferait tomber la session alors même qu'on est devant.
 *
 * Et il ne bat QUE s'il y a eu de l'activité depuis le dernier battement : un
 * onglet oublié ouvert ne doit surtout pas entretenir sa propre session, sans
 * quoi la règle des dix minutes ne vaudrait plus rien.
 *
 * L'avertissement
 * ---------------
 * Deux minutes avant, un panneau le dit, avec le compte à rebours. On ne
 * déconnecte pas quelqu'un sans l'avoir prévenu : un formulaire à moitié
 * rempli qui disparaît sans un mot, c'est le genre de chose qui fait
 * abandonner un outil.
 */

import { useState, useEffect, useRef } from "react";
import { currentUser, isAuthConfigured } from "../lib/auth.js";
import { INACTIVITE, INACTIVITE_PREAVIS } from "../lib/inactivite.js";
import { IconeHeure } from "./icones.jsx";

/* Les gestes qui comptent comme « je suis là ». Le simple mouvement de souris
   n'en fait pas partie : un bureau encombré, un chat, une table qui tremble
   suffisent à le produire, et la session ne tomberait jamais. */
const GESTES = ["pointerdown", "keydown", "wheel", "touchstart"];

/** Toutes les quatre minutes, et seulement si l'on a fait quelque chose. */
const BATTEMENT = 4 * 60 * 1000;

function VeilleSession({ actif, onExpire, notify }) {
  const [reste, setReste] = useState(null);
  const derniere = useRef(Date.now());
  const dernierBattement = useRef(Date.now());
  const expire = useRef(false);

  useEffect(() => {
    if (!actif || !isAuthConfigured) return undefined;

    derniere.current = Date.now();
    dernierBattement.current = Date.now();
    expire.current = false;

    const bouge = () => { derniere.current = Date.now(); };
    for (const g of GESTES) window.addEventListener(g, bouge, { passive: true });

    /* Revenir sur l'onglet ne compte pas comme une activité : on peut
       l'avoir rouvert par hasard , mais le minuteur doit se remettre à jour
       tout de suite, sinon le panneau apparaît avec du retard. */
    const reveil = () => { if (!document.hidden) tic(); };
    document.addEventListener("visibilitychange", reveil);

    const tic = () => {
      const inactif = (Date.now() - derniere.current) / 1000;
      const restant = Math.ceil(INACTIVITE - inactif);

      if (restant <= 0) {
        if (expire.current) return;
        expire.current = true;
        setReste(null);
        onExpire();
        return;
      }

      setReste(restant <= INACTIVITE_PREAVIS ? restant : null);

      /* Le battement, seulement si l'on a bougé depuis le dernier. */
      if (
        Date.now() - dernierBattement.current >= BATTEMENT
        && derniere.current > dernierBattement.current
      ) {
        dernierBattement.current = Date.now();
        currentUser().catch(() => {});
      }
    };

    const minuteur = setInterval(tic, 1000);
    tic();

    return () => {
      clearInterval(minuteur);
      document.removeEventListener("visibilitychange", reveil);
      for (const g of GESTES) window.removeEventListener(g, bouge);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [actif]);

  if (!actif || reste === null) return null;

  const minutes = Math.floor(reste / 60);
  const secondes = String(reste % 60).padStart(2, "0");

  const rester = () => {
    derniere.current = Date.now();
    dernierBattement.current = Date.now();
    setReste(null);
    /* On prévient le serveur tout de suite : il compte, lui aussi, et sa
       propre marge est presque écoulée au moment où ce bouton est cliqué. */
    currentUser().catch(() => {});
    notify?.("Session prolongée.");
  };

  return (
    <div className="vz-modal-bg vz-noprint" role="alertdialog" aria-live="assertive">
      <div className="vz-veille">
        <span className="vz-veille-icone"><IconeHeure size={22} /></span>
        <h2>Encore là ?</h2>
        <p>
          Votre session va se fermer dans <strong className="vz-veille-compte">{minutes}:{secondes}</strong> faute
          d'activité. C'est ce qui protège votre compte sur un poste que vous auriez quitté.
        </p>
        <button className="vz-btn vz-btn-primary vz-btn-form" onClick={rester} autoFocus>
          Rester connecté
        </button>
      </div>
    </div>
  );
}

export { VeilleSession };
