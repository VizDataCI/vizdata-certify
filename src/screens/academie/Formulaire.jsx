/* Formulaire de candidature.
 *
 * Ce formulaire écrit réellement : la candidature part dans la table
 * `candidatures` par la fonction `soumettre_candidature`, et la référence
 * rendue par la base est affichée au candidat. Rien n'est simulé : un
 * formulaire de page de vente qui n'enregistre pas est un formulaire qui perd
 * des inscriptions sans que personne ne le sache.
 *
 * L'ordre des opérations importe :
 *   1. la candidature est enregistrée ;
 *   2. la confirmation est affichée ;
 *   3. les e-mails partent, au mieux.
 *
 * Si l'envoi d'e-mail échoue, le candidat voit quand même sa référence et
 * l'administration voit quand même la candidature. L'inverse : attendre
 * l'e-mail pour confirmer : ferait dépendre une inscription d'un service
 * tiers.
 */

import { useState } from "react";
import * as academie from "../../academie/api.js";
import {
  FORMULES, NIVEAUX, montant, normaliserCandidature, validerCandidature,
} from "../../academie/candidature.js";
import { ORGANISME, whatsappUrl } from "../../academie/programme.js";

const VIDE = {
  nom: "", whatsapp: "", email: "", profession: "", entreprise: "",
  niveau: "", motivation: "", disponible: false, consent: false,
};

/** Champ de saisie, avec son message d'erreur et son identifiant d'aide. */
function Champ({ id, label, facultatif, erreur, aide, large, children }) {
  return (
    <div className={"ac-champ" + (large ? " large" : "")}>
      <label htmlFor={id}>
        {label} {facultatif && <span>(facultatif)</span>}
      </label>
      {children}
      {erreur && <span className="ac-erreur" id={`${id}-erreur`}>{erreur}</span>}
      {!erreur && aide && <span className="ac-aide" id={`${id}-aide`}>{aide}</span>}
    </div>
  );
}

function Formulaire({ cohorte, tarifs, formuleInitiale = "INTEGRAL", notify }) {
  const [v, setV] = useState(VIDE);
  const [erreurs, setErreurs] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const [panne, setPanne] = useState("");
  const [recu, setRecu] = useState(null);

  /* La formule suit le bouton cliqué dans la section des tarifs : « choisir le
     paiement en 2 fois » doit cocher la bonne case : jusqu'à ce que le
     visiteur en décide autrement dans le formulaire. Dérivée plutôt que
     recopiée par un effet : un effet ferait un second rendu à chaque clic, et
     surtout écraserait le choix du visiteur s'il remontait voir les tarifs. */
  const [formuleChoisie, setFormuleChoisie] = useState(null);
  const formule = formuleChoisie ?? formuleInitiale;

  const champ = (cle) => (e) => {
    const valeur = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setV((x) => ({ ...x, [cle]: valeur }));
    /* L'erreur disparaît dès la correction, pas à la prochaine validation. */
    setErreurs((x) => (x[cle] ? { ...x, [cle]: undefined } : x));
  };

  const soumettre = async (e) => {
    e.preventDefault();
    setPanne("");

    const fautes = validerCandidature({ ...v, formule });
    setErreurs(fautes);
    if (Object.keys(fautes).length) {
      /* On amène le premier champ fautif à l'écran : sur un téléphone, une
         erreur hors du cadre visible passe pour un bouton qui ne marche pas. */
      const premier = document.getElementById(`c-${Object.keys(fautes)[0]}`);
      if (premier) {
        premier.scrollIntoView({ behavior: "smooth", block: "center" });
        premier.focus({ preventScroll: true });
      }
      return;
    }

    setEnvoi(true);
    try {
      const propre = normaliserCandidature({ ...v, formule });
      /* Un seul appel : le registre enregistre la candidature, envoie l'accusé
         au candidat, alerte VIZDATA, et rend le verdict de l'accusé. */
      const { reference, courriel } = await academie.soumettreCandidature(propre);
      setRecu({ reference, prenom: propre.nom.split(" ")[0], courriel });
      if (notify) notify(`Candidature ${reference} enregistrée.`);
      window.scrollTo({ top: document.getElementById("candidature")?.offsetTop || 0, behavior: "smooth" });
    } catch (err) {
      setPanne(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  /* --- confirmation ------------------------------------------------------- */

  if (recu) {
    const suite = whatsappUrl(
      `Bonjour VIZDATA, je viens de déposer ma candidature ${recu.reference} pour la formation CITIZEN DATA ANALYST.`
    );
    return (
      <div className="ac-form-carte">
        <div className="ac-merci">
          <div className="ac-merci-sceau" aria-hidden="true">✓</div>
          <h3>Merci {recu.prenom}, votre candidature est enregistrée.</h3>
          <p>
            L'équipe VIZDATA l'examine et vous contacte sur WhatsApp pour valider votre profil,
            puis vous communiquer les modalités de paiement{cohorte?.libelle ? ` pour la ${cohorte.libelle.toLowerCase()}` : ""}.
          </p>
          <div className="ac-merci-ref">{recu.reference}</div>
          <p className="ac-aide">Conservez cette référence : elle identifie votre dossier.</p>

          {recu.courriel?.envoye ? (
            <p style={{ marginTop: 14 }}>
              Un accusé de réception vient de vous être envoyé par e-mail.
            </p>
          ) : (
            <p style={{ marginTop: 14 }}>
              L'accusé de réception par e-mail n'a pas pu être envoyé, mais votre candidature
              est bien enregistrée. Écrivez-nous sur WhatsApp si vous souhaitez une confirmation immédiate.
            </p>
          )}

          <div className="ac-merci-suite">
            <a className="ac-btn ac-btn-wa" href={suite} target="_blank" rel="noopener noreferrer">
              Confirmer sur WhatsApp
            </a>
            <a className="ac-btn ac-btn-ligne" href={`mailto:${ORGANISME.email}`}>Écrire à VIZDATA</a>
          </div>
        </div>
      </div>
    );
  }

  /* --- formulaire -------------------------------------------------------- */

  const champsAria = (cle) =>
    erreurs[cle]
      ? { "aria-invalid": "true", "aria-describedby": `c-${cle}-erreur` }
      : {};

  return (
    <form className="ac-form-carte" onSubmit={soumettre} noValidate>
      {!academie.estBranchee && (
        <div className="ac-alerte warn">
          <span>
            Cet environnement n'est pas relié à la base : la candidature ne pourra pas être
            enregistrée. Écrivez-nous sur WhatsApp au {ORGANISME.whatsappAffiche}.
          </span>
        </div>
      )}
      {panne && (
        <div className="ac-alerte err" role="alert">
          <span>
            {panne}{" "}
            <a href={whatsappUrl("Bonjour VIZDATA, je n'arrive pas à déposer ma candidature CITIZEN DATA ANALYST depuis le site.")}
               target="_blank" rel="noopener noreferrer">
              Déposer ma candidature sur WhatsApp
            </a>
          </span>
        </div>
      )}

      <div className="ac-champs">
        <Champ id="c-nom" label="Nom et prénoms" erreur={erreurs.nom} large>
          <input id="c-nom" type="text" value={v.nom} onChange={champ("nom")} autoComplete="name"
                 placeholder="KOUASSI Adjoua" required {...champsAria("nom")} />
        </Champ>

        <Champ id="c-whatsapp" label="Numéro WhatsApp" erreur={erreurs.whatsapp} aide="Indicatif accepté : +225…">
          <input id="c-whatsapp" type="tel" value={v.whatsapp} onChange={champ("whatsapp")}
                 autoComplete="tel" placeholder="05 04 38 35 32" required {...champsAria("whatsapp")} />
        </Champ>

        <Champ id="c-email" label="Adresse e-mail" erreur={erreurs.email}>
          <input id="c-email" type="email" value={v.email} onChange={champ("email")}
                 autoComplete="email" placeholder="adjoua.kouassi@exemple.ci" required {...champsAria("email")} />
        </Champ>

        <Champ id="c-profession" label="Profession ou fonction" erreur={erreurs.profession}>
          <input id="c-profession" type="text" value={v.profession} onChange={champ("profession")}
                 placeholder="Contrôleur de gestion" required {...champsAria("profession")} />
        </Champ>

        <Champ id="c-entreprise" label="Entreprise" facultatif>
          <input id="c-entreprise" type="text" value={v.entreprise} onChange={champ("entreprise")}
                 autoComplete="organization" placeholder="Nom de votre structure" />
        </Champ>

        <Champ id="c-niveau" label="Niveau actuel sur Excel" erreur={erreurs.niveau} large
               aide={NIVEAUX.find((n) => n.cle === v.niveau)?.aide}>
          <select id="c-niveau" value={v.niveau} onChange={champ("niveau")} required {...champsAria("niveau")}>
            <option value="">Choisissez votre niveau</option>
            {NIVEAUX.map((n) => <option key={n.cle} value={n.cle}>{n.label}</option>)}
          </select>
        </Champ>

        <Champ id="c-motivation" label="Pourquoi souhaitez-vous suivre cette formation ?"
               facultatif erreur={erreurs.motivation} large
               aide="Quelques lignes suffisent. Cela nous aide à préparer les ateliers.">
          <textarea id="c-motivation" value={v.motivation} onChange={champ("motivation")}
                    maxLength={2000} placeholder="Les rapports mensuels de mon service me prennent trois jours…" />
        </Champ>

        <div className="ac-champ large">
          <label htmlFor="c-formule">Mode de paiement</label>
          <div className="ac-formules" id="c-formule">
            {FORMULES.map((f) => {
              const prix = f.cle === "INTEGRAL" ? tarifs.integral : tarifs.echelonne;
              return (
                <label key={f.cle} className={"ac-formule-opt" + (formule === f.cle ? " on" : "")}>
                  <input type="radio" name="formule" value={f.cle}
                         checked={formule === f.cle} onChange={() => setFormuleChoisie(f.cle)} />
                  <span>
                    <span className="ac-formule-nom">{montant(prix)} : {f.label}</span>
                    <span className="ac-formule-det">
                      {f.versements === 2
                        ? `Deux versements de ${montant(prix / 2)}. Échéances communiquées avant validation.`
                        : "Réglé en une fois, à l'inscription."}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {erreurs.formule && <span className="ac-erreur">{erreurs.formule}</span>}
        </div>
      </div>

      <div className="ac-cases">
        <label className="ac-case">
          <input id="c-disponible" type="checkbox" checked={v.disponible} onChange={champ("disponible")} />
          <span>
            Je confirme être disponible pour participer aux 8 jours de formation en présentiel.
            {erreurs.disponible && <span className="ac-erreur" style={{ display: "block" }}>{erreurs.disponible}</span>}
          </span>
        </label>
        <label className="ac-case">
          <input id="c-consent" type="checkbox" checked={v.consent} onChange={champ("consent")} />
          <span>
            J'accepte d'être contacté par VIZDATA concernant mon inscription.
            {erreurs.consent && <span className="ac-erreur" style={{ display: "block" }}>{erreurs.consent}</span>}
          </span>
        </label>
      </div>

      <div className="ac-form-pied">
        <button className="ac-btn ac-btn-primaire ac-btn-bloc" type="submit" disabled={envoi}>
          {envoi ? "Envoi en cours…" : "Envoyer ma candidature"}
        </button>
        <p className="ac-rgpd">
          Aucun paiement n'est demandé à cette étape. Vos informations servent uniquement au
          traitement de votre inscription : elles ne sont ni publiées, ni cédées à des tiers.
        </p>
      </div>
    </form>
  );
}

export { Formulaire };
