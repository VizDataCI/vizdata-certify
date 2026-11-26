/* Accueil public.
 *
 * Deux publics, une seule page
 * ----------------------------
 * Un employeur arrive ici pour vérifier un certificat ; un titulaire, pour
 * retrouver le sien. La page sert les deux sans se couper en deux : le titre
 * s'adresse au titulaire (c'est lui le sujet du produit), et l'ACTION
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
 * chacun d'eux : c'est la règle, parce qu'un fichier manquant ne doit jamais
 * laisser un écran cassé :
 *
 *   1. SANS AUCUN FICHIER : le champ de nuit VIZDATA, avec sa vignette.
 *   2. AVEC `/accueil-graduation.jpg` : l'image fixe s'affiche, et sert
 *      d'affiche à la vidéo tant qu'elle se charge.
 *   3. AVEC `/accueil-graduation.mp4` : la séquence joue, muette, en boucle.
 *
 * Le plan en place, et d'où il vient
 * ----------------------------------
 * Des silhouettes de diplômés levant leur toque devant un ciel de coucher de
 * soleil. Le choix n'est pas qu'esthétique : à contre-jour, personne n'est
 * identifiable, donc la page ne promet le visage de personne, et l'orange du
 * ciel tombe sur la palette VIZDATA sans qu'on ait rien teinté.
 *
 *   Source   Pexels, « People Waving their Graduation Cap », olia danilevich.
 *            https://www.pexels.com/video/8061028/
 *   Licence  Licence Pexels : usage commercial libre, sans attribution. Elle
 *            est citée ici parce qu'un registre de certification se doit de
 *            savoir d'où vient ce qu'il affiche, pas parce qu'elle l'exige.
 *
 * La boucle est un PALINDROME : le plan joue à l'endroit, puis à l'envers.
 * Un montage bout à bout sautait deux fois, sur les bras qui se lèvent et sur
 * la caméra qui se resserre ; à l'envers, le mouvement se dénoue de lui-même
 * et la raccord est invisible. La recette, si le plan doit être refait :
 *
 *   ffmpeg -ss 2.4 -to 8.6 -i source.mp4 -an -filter_complex \
 *     "[0:v]scale=1600:900:flags=lanczos,setpts=PTS-STARTPTS,split[f][r];\
 *      [r]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[rv];\
 *      [f][rv]concat=n=2:v=1:a=0[v]" -map "[v]" -c:v libx264 -profile:v high \
 *     -pix_fmt yuv420p -crf 32 -preset veryslow -g 50 -movflags +faststart out.mp4
 *
 * Pourquoi un MP4 et pas un GIF
 * -----------------------------
 * Le même plan en GIF pèse huit à douze mégaoctets et ne connaît que 256
 * couleurs : ce ciel y deviendrait des bandes. En H.264 il pèse 832 Ko, garde
 * ses dégradés, et se décode par la puce vidéo plutôt que par le processeur.
 * Sur une connexion abidjanaise, c'est la différence entre une page qui
 * s'ouvre et une page qu'on abandonne.
 *
 * Pas de WebM non plus : réencodé en VP9, ce plan montait à 1,2 Mo, soit PLUS
 * que le H.264. Le VP9 gagne sur du détail, pas sur un ciel lisse. Une source
 * `.webm` servie en premier aurait donc fait télécharger le fichier le plus
 * lourd aux navigateurs qui la préfèrent, ce qui est l'inverse du but.
 *
 * Le cadrage laisse le tiers gauche calme : c'est là que le texte se pose. Et
 * la séquence ne joue pas pour qui a demandé moins d'animations : voir
 * `vz-scene-media` dans la feuille de style.
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
