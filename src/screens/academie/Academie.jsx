/* Page de vente : académie CITIZEN DATA ANALYST.
 *
 * Une page, onze sections, un objectif : que le visiteur comprenne la valeur
 * de la formation et dépose sa candidature. Les boutons d'inscription sont
 * répétés (hero, tarifs, barre fixe sur mobile, appel final) parce qu'un
 * visiteur décide à des moments différents selon ce qui l'a convaincu.
 *
 * Ce que la page n'invente jamais : les dates de session, le nombre de places,
 * les témoignages. Les deux premiers viennent de la cohorte publiée ; en son
 * absence la page le dit et renvoie vers WhatsApp. Il n'y a pas de section
 * témoignages tant que VIZDATA n'en a pas fourni.
 */

import { useEffect, useRef, useState } from "react";
import * as academie from "../../academie/api.js";
import { economie, montant, tarifsDe } from "../../academie/candidature.js";
import {
  AVANTAGES, BENEFICES, DIFFICULTES, ETAPES, FORMATEURS, INCLUS_COMMUN,
  MODULES, ORGANISME, PREREQUIS, PROFILS, REPERES, TARIFS_REPLI, faqListe, whatsappUrl,
} from "../../academie/programme.js";
import { fmtLong } from "../../lib/dates.js";
import { VizdataMark } from "../../ui/VizdataLogo.jsx";
import { Formulaire } from "./Formulaire.jsx";
import { ApercuTableauBord, Photo } from "./Visuels.jsx";

const TITRE_PAGE = "Devenez un Citizen Data Analyst : Excel et Power BI | VIZDATA";
const DESCRIPTION_PAGE =
  "8 jours de formation intensive en présentiel à Abidjan pour maîtriser Excel et Power BI : " +
  "préparation, analyse, automatisation et visualisation des données. Deux certificats VIZDATA, " +
  "cohortes trimestrielles.";

/* --- référencement --------------------------------------------------------
   L'application est une page unique : le titre et la description de
   index.html décrivent le registre de certificats. Une page de vente qui
   hériterait de ce titre serait introuvable. On les remplace à l'affichage, et
   on les restitue en quittant la page : sans quoi le reste de l'application
   garderait le titre de l'académie dans l'onglet et dans l'historique.

   Les robots de LinkedIn et WhatsApp n'exécutent pas le JavaScript : l'aperçu
   de partage restera celui de index.html jusqu'à un rendu côté serveur. C'est
   une limite connue du projet, documentée dans le README. */

function useReferencement(cohorte, tarifs) {
  useEffect(() => {
    const titreInitial = document.title;
    document.title = TITRE_PAGE;

    const balises = [];
    const poser = (selecteur, attribut, valeur, creer) => {
      let el = document.head.querySelector(selecteur);
      if (!el) {
        el = creer();
        document.head.appendChild(el);
        balises.push({ el, retirer: true });
      } else {
        balises.push({ el, attribut, ancien: el.getAttribute(attribut) });
      }
      el.setAttribute(attribut, valeur);
    };

    poser('meta[name="description"]', "content", DESCRIPTION_PAGE, () => {
      const m = document.createElement("meta");
      m.setAttribute("name", "description");
      return m;
    });
    poser('meta[property="og:title"]', "content", TITRE_PAGE, () => {
      const m = document.createElement("meta");
      m.setAttribute("property", "og:title");
      return m;
    });
    poser('meta[property="og:description"]', "content", DESCRIPTION_PAGE, () => {
      const m = document.createElement("meta");
      m.setAttribute("property", "og:description");
      return m;
    });

    /* Données structurées : un cours et son organisme. Les dates et le tarif
       ne sont déclarés que s'ils existent réellement. */
    const donnees = {
      "@context": "https://schema.org",
      "@type": "Course",
      name: "CITIZEN DATA ANALYST : Excel et Power BI",
      description: DESCRIPTION_PAGE,
      inLanguage: "fr",
      provider: {
        "@type": "Organization",
        name: ORGANISME.nom,
        url: ORGANISME.site,
        email: ORGANISME.email,
        address: { "@type": "PostalAddress", addressLocality: "Abidjan", addressCountry: "CI" },
      },
      hasCourseInstance: {
        "@type": "CourseInstance",
        courseMode: "onsite",
        courseWorkload: "P8D",
        location: { "@type": "Place", name: cohorte?.lieu || ORGANISME.lieu },
        ...(cohorte?.date_debut ? { startDate: cohorte.date_debut } : {}),
        ...(cohorte?.date_fin ? { endDate: cohorte.date_fin } : {}),
      },
      offers: [
        { "@type": "Offer", price: tarifs.integral, priceCurrency: "XOF", category: "Paiement intégral", availability: "https://schema.org/LimitedAvailability" },
        { "@type": "Offer", price: tarifs.echelonne, priceCurrency: "XOF", category: "Paiement en deux fois", availability: "https://schema.org/LimitedAvailability" },
      ],
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(donnees);
    document.head.appendChild(script);

    return () => {
      document.title = titreInitial;
      for (const b of balises) {
        if (b.retirer) b.el.remove();
        else if (b.ancien !== null) b.el.setAttribute(b.attribut, b.ancien);
      }
      script.remove();
    };
  }, [cohorte, tarifs.integral, tarifs.echelonne]);
}

/* --- apparition au défilement ---------------------------------------------
   Discrète et optionnelle : la classe de départ n'est posée que si
   l'observateur existe, pour qu'un navigateur sans IntersectionObserver
   affiche la page entière plutôt que du vide. */

function useApparition() {
  const racine = useRef(null);

  useEffect(() => {
    if (!racine.current || typeof IntersectionObserver === "undefined") return;
    const cibles = racine.current.querySelectorAll("[data-reveal]");
    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          if (e.isIntersecting) {
            e.target.classList.add("vu");
            observateur.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    for (const c of cibles) {
      c.classList.add("ac-reveal");
      observateur.observe(c);
    }
    return () => observateur.disconnect();
  }, []);

  return racine;
}

/* --- bandeau de cohorte ---------------------------------------------------- */

function BandeauCohorte({ cohorte, charge }) {
  if (!charge) return null;

  if (!cohorte) {
    return (
      <div className="ac-cohorte attente">
        <span className="ac-cohorte-pastille">Prochaine cohorte</span>
        <span>Les dates de la session à venir sont en cours de programmation.</span>
        <span className="ac-cohorte-sep" />
        <a href={whatsappUrl("Bonjour VIZDATA, je souhaite être prévenu de l'ouverture de la prochaine cohorte CITIZEN DATA ANALYST.")}
           target="_blank" rel="noopener noreferrer">Être prévenu de l'ouverture →</a>
      </div>
    );
  }

  const dates = cohorte.date_debut
    ? cohorte.date_fin
      ? `du ${fmtLong(cohorte.date_debut)} au ${fmtLong(cohorte.date_fin)}`
      : `à partir du ${fmtLong(cohorte.date_debut)}`
    : "dates communiquées à l'inscription";

  return (
    <div className="ac-cohorte">
      <span className="ac-cohorte-pastille">{cohorte.libelle}</span>
      <span>{dates}</span>
      <span className="ac-cohorte-sep" />
      <span>{cohorte.lieu}</span>
      {cohorte.places_restantes !== null && cohorte.places_restantes !== undefined && (
        <>
          <span className="ac-cohorte-sep" />
          <span><strong>{cohorte.places_restantes}</strong> place{cohorte.places_restantes > 1 ? "s" : ""} restante{cohorte.places_restantes > 1 ? "s" : ""}</span>
        </>
      )}
      {cohorte.statut === "COMPLETE" && (
        <>
          <span className="ac-cohorte-sep" />
          <span><strong>Session complète.</strong> Les candidatures sont enregistrées pour la suivante</span>
        </>
      )}
      {cohorte.note_publique && (
        <>
          <span className="ac-cohorte-sep" />
          <span>{cohorte.note_publique}</span>
        </>
      )}
    </div>
  );
}

/* --- page ------------------------------------------------------------------ */

function Academie(p) {
  const [cohorte, setCohorte] = useState(null);
  const [charge, setCharge] = useState(false);
  const [formulePreselection, setFormulePreselection] = useState("INTEGRAL");
  const racine = useApparition();

  useEffect(() => {
    let vivant = true;
    academie.cohortePubliee()
      .then((c) => { if (vivant) { setCohorte(c); setCharge(true); } })
      .catch(() => { if (vivant) setCharge(true); });
    return () => { vivant = false; };
  }, []);

  /* Une adresse partagée avec une ancre, /academie#tarifs dans une publicité
     ou un message WhatsApp : arrive avant que React n'ait posé les sections :
     le navigateur ne trouve rien à cibler et laisse le visiteur en haut de
     page. On rejoue le saut une fois la page montée. */
  useEffect(() => {
    const ancre = window.location.hash.slice(1);
    if (!ancre) return;
    const cible = document.getElementById(decodeURIComponent(ancre));
    if (cible) cible.scrollIntoView({ block: "start" });
  }, []);

  const tarifs = tarifsDe(cohorte, TARIFS_REPLI);
  const gain = economie(tarifs);
  useReferencement(cohorte, tarifs);

  /** Conduit au formulaire, en retenant la formule choisie en chemin. */
  const versFormulaire = (formule) => {
    if (formule) setFormulePreselection(formule);
    const cible = document.getElementById("candidature");
    if (cible) cible.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const lienWhatsapp = whatsappUrl(
    "Bonjour VIZDATA, je souhaite des informations sur la formation CITIZEN DATA ANALYST (Excel et Power BI)."
  );

  return (
    <div className="ac" ref={racine}>
      {/* --- barre --- */}
      <header className="ac-bar">
        <div className="ac-bar-in">
          <button className="ac-bar-marque" onClick={() => p.go({ view: "home" })} aria-label="VIZDATA">
            <VizdataMark size={24} />
            <span className="ac-bar-mot">vizdata</span>
            <span className="ac-bar-div" />
            <span className="ac-bar-sous">Académie</span>
          </button>
          <nav className="ac-bar-liens" aria-label="Sections de la page">
            <a href="#programme">Programme</a>
            <a href="#tarifs">Tarifs</a>
            <a href="#formateurs">Formateurs</a>
            <a href="#questions">Questions</a>
          </nav>
          <button className="ac-btn ac-btn-primaire" onClick={() => versFormulaire()}>Réserver ma place</button>
        </div>
      </header>

      {/* --- 1. hero --- */}
      <section className="ac-hero">
        <div className="ac-wrap">
          <div className="ac-hero-grid">
            <div>
              <span className="ac-eyebrow">Académie VIZDATA · Abidjan</span>
              <h1>Devenez un <span className="ac-trait">Citizen Data&nbsp;Analyst</span>.</h1>
              <p className="ac-hero-sous">
                Maîtrisez Excel et Power BI pour transformer vos données en informations utiles
                et prendre de meilleures décisions professionnelles.
              </p>
              <p className="ac-hero-comp">
                En 8 jours de formation intensive en présentiel, développez des compétences pratiques
                en préparation, analyse, automatisation et visualisation des données.
              </p>
              <div className="ac-hero-actions">
                <button className="ac-btn ac-btn-primaire" onClick={() => versFormulaire()}>Réserver ma place</button>
                <a className="ac-btn ac-btn-ligne" href="#programme">Voir le programme</a>
              </div>
              <p className="ac-hero-rassure">
                Candidature en 2 minutes. Aucun paiement à cette étape : l'équipe VIZDATA vous contacte avant toute validation.
              </p>
            </div>
            <ApercuTableauBord />
          </div>

          <div style={{ marginTop: 34 }}>
            <BandeauCohorte cohorte={cohorte} charge={charge} />
          </div>

          <div className="ac-reperes">
            {REPERES.map((r) => (
              <div className="ac-repere" key={r.valeur}>
                <div className="ac-repere-val">{r.valeur}</div>
                <div className="ac-repere-lib">{r.libelle}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- 2. le problème --- */}
      <section className="ac-section surface">
        <div className="ac-wrap">
          <div className="ac-head" data-reveal>
            <span className="ac-eyebrow">Le constat</span>
            <h2>Vous manipulez des données chaque jour. Savez-vous réellement les exploiter ?</h2>
            <p>
              La plupart des professionnels passent plus de temps à fabriquer leurs fichiers
              qu'à lire ce qu'ils disent. Ces cinq situations vous sont probablement familières.
            </p>
          </div>
          <div className="ac-grille ac-g2" data-reveal>
            {DIFFICULTES.map((d) => (
              <div className="ac-pb" key={d.titre}>
                <h3>{d.titre}</h3>
                <p>{d.texte}</p>
              </div>
            ))}
          </div>
          <div className="ac-bascule" data-reveal>
            <p>
              Il est temps de passer de simple utilisateur de données
              à véritable acteur de leur analyse.
            </p>
            <button className="ac-btn ac-btn-primaire" onClick={() => versFormulaire()}>Je candidate</button>
          </div>
        </div>
      </section>

      {/* --- 3. la solution --- */}
      <section className="ac-section" id="programme">
        <div className="ac-wrap">
          <div className="ac-head" data-reveal>
            <span className="ac-eyebrow">Le programme</span>
            <h2>Deux outils. Une nouvelle compétence professionnelle.</h2>
            <p>
              Quatre jours sur Excel, quatre jours sur Power BI. Le même fil conducteur dans les
              deux modules : préparer la donnée, la modéliser, la mesurer, puis la restituer.
            </p>
          </div>
          <div className="ac-grille ac-g2" data-reveal>
            {MODULES.map((m) => (
              <article className="ac-module" key={m.code}>
                <div className={"ac-module-tete " + (m.code === "EXCEL" ? "excel" : "pbi")}>
                  <div className="ac-module-num">{m.numero}</div>
                  <h3>{m.titre}</h3>
                  <span className="ac-module-duree">{m.duree}</span>
                </div>
                <div className="ac-module-obj"><b>Objectif :</b> {m.objectif}</div>
                <div className="ac-module-corps">
                  <div>Au programme</div>
                  <ul className="ac-prog">
                    {m.programme.map((ligne, i) => (
                      <li key={ligne}>
                        <span className="ac-prog-n">{String(i + 1).padStart(2, "0")}</span>
                        <span>{ligne}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --- 4. les bénéfices --- */}
      <section className="ac-section surface">
        <div className="ac-wrap">
          <div className="ac-head" data-reveal>
            <span className="ac-eyebrow">Les acquis</span>
            <h2>Ce que vous serez capable de faire après la formation.</h2>
            <p>Sept compétences opérationnelles, applicables dès le retour au bureau.</p>
          </div>
          <div className="ac-grille ac-g3" data-reveal>
            {BENEFICES.map((b, i) => (
              <div className="ac-carte ombre" key={b.titre}>
                <div className={"ac-puce " + ["bleu", "violet", "orange"][i % 3]}>{String(i + 1).padStart(2, "0")}</div>
                <h3>{b.titre}</h3>
                <p>{b.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- 5. public visé --- */}
      <section className="ac-section">
        <div className="ac-wrap">
          <div className="ac-head" data-reveal>
            <span className="ac-eyebrow">Le public</span>
            <h2>À qui s'adresse cette formation ?</h2>
            <p>
              À des professionnels qui travaillent déjà avec des données, quel que soit leur métier.
              Aucune compétence en programmation n'est demandée.
            </p>
          </div>
          <div className="ac-profils" data-reveal>
            {PROFILS.map((pr) => (
              <div className="ac-profil" key={pr}>
                <span className="ac-profil-pt" />
                <span>{pr}</span>
              </div>
            ))}
          </div>
          <div className="ac-prereq" data-reveal>
            <h3>Prérequis</h3>
            <ul className="ac-check">
              {PREREQUIS.map((pq) => <li key={pq}>{pq}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* --- 6. les avantages --- */}
      <section className="ac-section surface">
        <div className="ac-wrap">
          <div className="ac-head" data-reveal>
            <span className="ac-eyebrow">Inclus dans la formation</span>
            <h2>Six avantages qui prolongent les 8 jours.</h2>
            <p>La formation ne s'arrête pas au dernier jour de la session.</p>
          </div>
          <div className="ac-grille ac-g3" data-reveal>
            {AVANTAGES.map((a, i) => (
              <div className="ac-carte ombre" key={a.titre}>
                <div className={"ac-puce " + ["orange", "bleu", "violet"][i % 3]}>{i + 1}</div>
                <h3>{a.titre}</h3>
                <p>{a.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- 7. tarifs --- */}
      <section className="ac-section" id="tarifs">
        <div className="ac-wrap">
          <div className="ac-head centre" data-reveal>
            <span className="ac-eyebrow">Les tarifs</span>
            <h2>Investissez dans une compétence qui vous accompagnera toute votre carrière.</h2>
            <p>Deux formules, le même programme et les mêmes certificats.</p>
          </div>
          <div className="ac-tarifs" data-reveal>
            <div className="ac-tarif phare">
              <div className="ac-tarif-ruban">Le plus avantageux</div>
              <div className="ac-tarif-nom">Formule 1 : paiement intégral</div>
              <div className="ac-tarif-prix">{montant(tarifs.integral)}</div>
              <div className="ac-tarif-detail">Réglé en une fois, à l'inscription.</div>
              {gain > 0 && <div className="ac-tarif-eco">Économie de {montant(gain)}</div>}
              <ul className="ac-check orange">
                {INCLUS_COMMUN.map((x) => <li key={x}>{x}</li>)}
              </ul>
              <button className="ac-btn ac-btn-primaire ac-btn-bloc" onClick={() => versFormulaire("INTEGRAL")}>
                Choisir le paiement intégral
              </button>
            </div>

            <div className="ac-tarif">
              <div className="ac-tarif-nom">Formule 2 : paiement échelonné</div>
              <div className="ac-tarif-prix">{montant(tarifs.echelonne)}</div>
              <div className="ac-tarif-detail">
                Deux versements de {montant(tarifs.echelonne / 2)}.
              </div>
              <ul className="ac-check">
                {INCLUS_COMMUN.map((x) => <li key={x}>{x}</li>)}
                <li>Paiement en deux versements</li>
              </ul>
              <button className="ac-btn ac-btn-bleu ac-btn-bloc" onClick={() => versFormulaire("ECHELONNE")}>
                Choisir le paiement en 2 fois
              </button>
            </div>
          </div>
          <p className="ac-tarif-note" data-reveal>
            Les conditions et les échéances du deuxième versement sont communiquées au candidat
            avant la validation de son inscription. Aucun paiement n'est demandé au moment de la candidature.
          </p>
        </div>
      </section>

      {/* --- 8. les formateurs --- */}
      <section className="ac-section surface" id="formateurs">
        <div className="ac-wrap">
          <div className="ac-head" data-reveal>
            <span className="ac-eyebrow">L'encadrement</span>
            <h2>Les formateurs</h2>
            <p>Deux praticiens, chacun sur son outil.</p>
          </div>
          <div className="ac-grille ac-g2" data-reveal>
            {FORMATEURS.map((f) => (
              <article className="ac-formateur" key={f.nom}>
                <Photo src={f.photo} alt={`${f.nom}, ${f.role}`} initiales={f.initiales} />
                <div>
                  <h3>{f.nom}</h3>
                  <div className="ac-formateur-role">{f.role}</div>
                  <ul className="ac-check">
                    {f.points.map((pt) => <li key={pt}>{pt}</li>)}
                  </ul>
                  {f.aCompleter && <p className="ac-formateur-note">{f.aCompleter}</p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --- 9. formulaire de candidature --- */}
      <section className="ac-section" id="candidature">
        <div className="ac-wrap">
          <div className="ac-form-grid">
            <div data-reveal>
              <span className="ac-eyebrow">Candidature</span>
              <h2 style={{ margin: "16px 0 14px" }}>
                Prêt à développer vos compétences en analyse de données ?
              </h2>
              <p style={{ color: "var(--gris)", fontSize: 17 }}>
                Déposez votre candidature : l'équipe VIZDATA vous contacte sur WhatsApp
                pour valider votre profil et vous communiquer les modalités.
              </p>

              <div className="ac-grille" style={{ gap: 14, marginTop: 28 }}>
                {ETAPES.map((e, i) => (
                  <div key={e.titre} style={{ display: "flex", gap: 14 }}>
                    <div className="ac-puce bleu" style={{ marginBottom: 0, flex: "0 0 38px" }}>{i + 1}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15.5 }}>{e.titre}</div>
                      <div style={{ color: "var(--gris)", fontSize: 14.5 }}>{e.texte}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="ac-alerte info" style={{ marginTop: 28, marginBottom: 0 }}>
                <span>
                  Une question avant de candidater ? Écrivez-nous sur WhatsApp au{" "}
                  <a href={lienWhatsapp} target="_blank" rel="noopener noreferrer">{ORGANISME.whatsappAffiche}</a>{" "}
                  ou par e-mail à <a href={`mailto:${ORGANISME.email}`}>{ORGANISME.email}</a>.
                </span>
              </div>
            </div>

            <div data-reveal>
              <Formulaire
                cohorte={cohorte}
                tarifs={tarifs}
                formuleInitiale={formulePreselection}
                notify={p.notify}
              />
            </div>
          </div>
        </div>
      </section>

      {/* --- 10. questions fréquentes --- */}
      <section className="ac-section surface" id="questions">
        <div className="ac-wrap">
          <div className="ac-head" data-reveal>
            <span className="ac-eyebrow">Questions fréquentes</span>
            <h2>Ce que les candidats demandent le plus souvent.</h2>
          </div>
          <div className="ac-faq" data-reveal>
            {faqListe(tarifs).map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <div className="ac-faq-rep">{item.r}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* --- 11. appel final --- */}
      <section className="ac-section nuit">
        <div className="ac-wrap">
          <div className="ac-final" data-reveal>
            <span className="ac-eyebrow">Prochaine cohorte</span>
            <h2>Votre prochaine évolution professionnelle commence ici.</h2>
            <p>
              Ne vous contentez plus de produire des fichiers et des rapports. Apprenez à exploiter
              les données, à automatiser vos analyses et à éclairer vos décisions.
              Rejoignez la prochaine cohorte CITIZEN DATA ANALYST de VIZDATA.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="ac-btn ac-btn-primaire" onClick={() => versFormulaire()}>Je candidate maintenant</button>
              <a className="ac-btn ac-btn-ligne" href={lienWhatsapp} target="_blank" rel="noopener noreferrer">
                Écrire sur WhatsApp
              </a>
            </div>
          </div>

          <div className="ac-etapes" style={{ marginTop: 64 }} data-reveal>
            {ETAPES.map((e) => (
              <div className="ac-etape" key={e.titre}>
                <h3>{e.titre}</h3>
                <p>{e.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- pied de page --- */}
      <footer className="ac-pied">
        <div className="ac-wrap">
          <div className="ac-pied-grid">
            <div style={{ maxWidth: 330 }}>
              <div style={{ background: "#fff", display: "inline-flex", padding: "9px 12px", borderRadius: 10 }}>
                <VizdataMark size={26} />
              </div>
              <p style={{ marginTop: 14, fontSize: 13.5, lineHeight: 1.6 }}>
                VIZDATA accompagne les organisations et les professionnels d'Afrique de l'Ouest
                dans l'exploitation de leurs données.
              </p>
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Contact</div>
              <p><a href={`mailto:${ORGANISME.email}`}>{ORGANISME.email}</a></p>
              <p style={{ marginTop: 6 }}><a href={lienWhatsapp} target="_blank" rel="noopener noreferrer">WhatsApp {ORGANISME.whatsappAffiche}</a></p>
              <p style={{ marginTop: 6 }}>{ORGANISME.lieu}</p>
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 600, marginBottom: 10, fontSize: 14 }}>VIZDATA</div>
              <p><a href={ORGANISME.site} target="_blank" rel="noopener noreferrer">vizdata.ci</a></p>
              <p style={{ marginTop: 6 }}>
                <button onClick={() => p.go({ view: "verify" })} style={{ background: "none", border: 0, padding: 0, color: "#CBD6E6", cursor: "pointer", font: "inherit" }}>
                  Vérifier un certificat
                </button>
              </p>
            </div>
          </div>
          <div className="ac-pied-legal">
            Les informations transmises par le formulaire de candidature servent uniquement au
            traitement de votre inscription. Elles ne sont ni publiées, ni cédées à des tiers.
            Pour y accéder, les corriger ou demander leur suppression, écrivez à {ORGANISME.email}.
          </div>
        </div>
      </footer>

      {/* --- barre d'action mobile --- */}
      <div className="ac-mobile-cta">
        <button className="ac-btn ac-btn-primaire" onClick={() => versFormulaire()}>Réserver ma place</button>
        <a className="ac-btn ac-btn-wa" href={lienWhatsapp} target="_blank" rel="noopener noreferrer" aria-label="Écrire sur WhatsApp">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.01c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.03.24-3.47-.72-2.94-1.16-4.8-4.2-4.95-4.4-.14-.19-1.16-1.55-1.16-2.95 0-1.4.73-2.09 1-2.38.26-.29.58-.36.77-.36.19 0 .39 0 .56.01.18.01.42-.07.65.5.24.58.82 2 .89 2.14.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.14-.3.3-.13.59.17.29.77 1.27 1.65 2.06 1.13 1.01 2.08 1.32 2.37 1.47.29.15.46.12.63-.07.17-.19.73-.85.93-1.14.19-.29.39-.24.65-.15.27.1 1.69.8 1.98.94.29.15.48.22.56.34.07.12.07.7-.17 1.38Z" />
          </svg>
        </a>
      </div>
    </div>
  );
}

export { Academie };
