/* Accueil public.
 *
 * Deux publics, une seule page
 * ----------------------------
 * Un employeur arrive ici pour vérifier un certificat ; un titulaire, pour
 * retrouver le sien. La page sert les deux sans se couper en deux : le titre
 * s'adresse au titulaire — c'est lui le sujet du produit —, et l'ACTION
 * principale sert l'employeur, parce que c'est la plus urgente des deux. Il
 * vérifie en moins de dix secondes, sans explication préalable, et sans avoir
 * à lire une ligne de présentation.
 *
 * La scène
 * --------
 * Le fond de l'accueil accueille une séquence de remise de diplômes. Ce n'est
 * pas une décoration : c'est ce que la plateforme produit, et montrer la chose
 * plutôt que d'en parler est la seule accroche qui n'a pas besoin d'adjectifs.
 *
 * Trois niveaux, du plus léger au plus riche, et la page est complète à
 * chacun d'eux — c'est la règle, parce qu'un fichier manquant ne doit jamais
 * laisser un écran cassé :
 *
 *   1. SANS AUCUN FICHIER — le champ de nuit VIZDATA, avec sa vignette. C'est
 *      l'état actuel, et il se tient.
 *   2. AVEC `/accueil-graduation.jpg` — l'image fixe s'affiche, et sert
 *      d'affiche à la vidéo tant qu'elle se charge.
 *   3. AVEC `/accueil-graduation.mp4` (et, au choix, `.webm`) — la séquence
 *      joue, muette et en boucle.
 *
 * Pourquoi une vidéo plutôt qu'un GIF
 * -----------------------------------
 * Un GIF de six secondes en 1600 px pèse huit à douze mégaoctets, ne connaît
 * que 256 couleurs — les dégradés d'une salle de cérémonie y deviennent des
 * bandes — et se décode par le processeur. Le même plan en MP4 (H.264) pèse
 * entre 400 et 800 kilooctets, garde ses couleurs, et se décode par la puce
 * vidéo. Sur une connexion abidjanaise, c'est la différence entre une page qui
 * s'ouvre et une page qu'on abandonne. Le GIF reste accepté si le fichier
 * déposé en est un, mais le MP4 est servi en premier.
 *
 * Ce qu'il faut déposer dans `public/`, exactement :
 *
 *   accueil-graduation.mp4   H.264, 6 à 10 s, bouclable, MUETTE, ≤ 1 Mo,
 *                            1600 × 900 ou 1920 × 1080, mouvement lent
 *                            (travelling ou plan fixe : un plan agité sous du
 *                            texte est illisible).
 *   accueil-graduation.webm  Facultatif. VP9, même plan, souvent 30 % plus léger.
 *   accueil-graduation.jpg   L'affiche. Une image clé de la séquence, ≤ 250 Ko,
 *                            pour que le premier affichage ne soit jamais vide.
 *
 * Le cadrage doit laisser le tiers gauche calme : c'est là que le texte se
 * pose. Et la séquence ne joue pas pour qui a demandé moins d'animations —
 * voir `vz-scene-media` dans la feuille de style.
 */

import { useState } from "react";
import { REFERENCE_EXEMPLE } from "../../data/seed.js";
import { IconeAuthentique, IconeDroite, IconeRecherche, IconeVerrou } from "../../ui/icones.jsx";
import { PublicShell } from "./PublicShell.jsx";

/* Les trois points décrivent le service, ils ne le vantent pas : ce sont des
   faits vérifiables sur cette plateforme, pas des chiffres d'effet. Un
   registre de certification qui se présenterait avec des statistiques
   flatteuses perdrait exactement ce qu'il vend. */
const POINTS = [
  {
    icone: IconeRecherche,
    titre: "Vérification immédiate",
    texte: "La référence imprimée sur le certificat, ou son QR code. L'une comme l'autre mènent ici, sans compte à créer.",
  },
  {
    icone: IconeAuthentique,
    titre: "Registre officiel",
    texte: "Chaque certification délivrée par VIZDATA y est enregistrée, avec sa date, son type et son statut.",
  },
  {
    icone: IconeVerrou,
    titre: "Rien de personnel",
    texte: "La page de vérification montre l'intitulé et le titulaire. Jamais une adresse, jamais un téléphone.",
  },
];

function Home(p) {
  const [ref, setRef] = useState("");
  const submit = () => {
    if (!ref.trim()) return;
    p.go({ view: "verify", prefill: ref });
  };

  return (
    <PublicShell {...p} transparent>
      <section className="vz-scene">
        {/* La couche média. `aria-hidden` : elle ne dit rien que le texte ne
            dise déjà, et un lecteur d'écran n'a pas à l'annoncer. */}
        <div className="vz-scene-media" aria-hidden="true">
          <video
            className="vz-scene-video"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/accueil-graduation.jpg"
          >
            <source src="/accueil-graduation.webm" type="video/webm" />
            <source src="/accueil-graduation.mp4" type="video/mp4" />
          </video>
        </div>
        {/* Le voile. Il n'est pas uniforme : plus dense à gauche, là où le
            texte se pose, et presque nul à droite, pour que la scène reste
            visible. Un voile plat sur toute la largeur éteint l'image qu'on a
            pris la peine de mettre. */}
        <div className="vz-scene-voile" aria-hidden="true" />

        <div className="vz-scene-contenu">
          <div className="vz-scene-eyebrow">Registre officiel des certifications VIZDATA</div>
          <h1 className="vz-display vz-scene-titre">Vos compétences méritent d'être reconnues.</h1>
          <p className="vz-chapeau vz-scene-chapeau">
            Retrouvez, vérifiez et valorisez vos certificats de formation délivrés par VIZDATA.
          </p>

          <div className="vz-scene-recherche">
            <label className="vz-scene-label" htmlFor="vz-ref-accueil">
              Vérifier un certificat
            </label>
            <div className="vz-searchbox">
              <input
                id="vz-ref-accueil"
                className="vz-input"
                placeholder={REFERENCE_EXEMPLE}
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoComplete="off"
                spellCheck="false"
              />
              <button className="vz-btn vz-btn-primary vz-btn-lg" onClick={submit}>
                <IconeRecherche size={17} /> Vérifier
              </button>
            </div>
            <p className="vz-scene-aide">
              La référence est imprimée sous le QR code, au format <span className="vz-mono">VIZ-2026-…</span>
            </p>
          </div>

          <div className="vz-scene-actions">
            <button className="vz-btn vz-btn-clair" onClick={() => p.go({ view: "login" })}>
              Accéder à mon espace <IconeDroite size={15} />
            </button>
            <button className="vz-btn vz-btn-fantome-clair" onClick={() => p.go({ view: "about" })}>
              Découvrir la plateforme
            </button>
          </div>
        </div>
      </section>

      <section className="vz-points">
        {POINTS.map((x) => (
          <article key={x.titre} className="vz-point">
            <span className="vz-point-icone"><x.icone size={18} /></span>
            <h3>{x.titre}</h3>
            <p>{x.texte}</p>
          </article>
        ))}
      </section>
    </PublicShell>
  );
}

export { Home };
