/* Contenu du programme CITIZEN DATA ANALYST.
 *
 * Tout le texte de la page de vente vit ici, séparé de son affichage : une
 * correction de libellé ne demande pas de relire du JSX, et la page se relit
 * d'un bloc pour vérifier qu'elle dit bien ce que VIZDATA vend.
 *
 * Ce qui n'est PAS dans ce fichier, volontairement : les dates de session, le
 * nombre de places et les tarifs. Ils viennent de la table `cohortes`, parce
 * qu'ils changent à chaque trimestre et qu'une mise en production pour
 * modifier une date serait une faute de conception. Les montants ci-dessous ne
 * servent que de repli quand aucune cohorte n'est publiée.
 */

import { montant } from "./candidature.js";

const ORGANISME = {
  nom: "VIZDATA",
  site: "https://vizdata.ci/",
  email: "contact@vizdata.ci",
  /* Le numéro affiché et le numéro technique diffèrent : wa.me n'accepte que
     les chiffres, indicatif compris, sans le « + ». */
  whatsappAffiche: "+225 05 04 38 35 32",
  whatsappLien: "2250504383532",
  lieu: "Abidjan, Côte d'Ivoire",
};

/** Message pré-rempli du bouton WhatsApp. */
const whatsappUrl = (message) =>
  `https://wa.me/${ORGANISME.whatsappLien}?text=${encodeURIComponent(message)}`;

/* --- repères affichés dans le hero --------------------------------------- */

const REPERES = [
  { valeur: "Présentiel", libelle: "Formation en salle, à Abidjan" },
  { valeur: "8 jours", libelle: "Intensifs, en cohorte" },
  { valeur: "2 outils", libelle: "Excel et Power BI" },
  { valeur: "2 certificats", libelle: "Excel et Power BI" },
  { valeur: "Trimestriel", libelle: "Une nouvelle cohorte tous les 3 mois" },
];

/* --- section 2 : le problème --------------------------------------------- */

const DIFFICULTES = [
  {
    titre: "Des fichiers Excel difficiles à exploiter",
    texte: "Des colonnes ajoutées au fil du temps, des onglets qui se ressemblent, et une structure que personne n'ose plus toucher.",
  },
  {
    titre: "Des rapports refaits à la main chaque mois",
    texte: "Les mêmes copier-coller, les mêmes mises en forme, le même temps perdu, pour un résultat qui périme en une semaine.",
  },
  {
    titre: "Des erreurs dans les calculs et les consolidations",
    texte: "Une formule étendue trop loin, un fichier oublié dans la consolidation, et le chiffre présenté en réunion devient faux.",
  },
  {
    titre: "Des tableaux de bord hors d'atteinte",
    texte: "La demande arrive, « un tableau de bord par agence, mis à jour automatiquement », et les outils en place ne suivent pas.",
  },
  {
    titre: "Des données disponibles, mais peu exploitées",
    texte: "L'information existe dans les systèmes. Elle n'arrive pas, sous une forme lisible, au moment où la décision se prend.",
  },
];

/* --- section 3 : la solution --------------------------------------------- */

const MODULES = [
  {
    code: "EXCEL",
    numero: "Module 1",
    titre: "Excel",
    duree: "4 jours",
    objectif: "Automatiser et fiabiliser l'analyse de données avec Excel.",
    programme: [
      "Gestion et structuration des données",
      "Mise en forme conditionnelle et validation des données",
      "Tris et filtres avancés",
      "Formules avancées",
      "Tableaux et graphiques croisés dynamiques",
      "Introduction et utilisation de Power Query",
      "Connexion à plusieurs sources de données",
      "Nettoyage, transformation et consolidation",
      "Introduction à Power Pivot",
      "Modélisation et relations entre les tables",
      "Création de KPI avec DAX",
      "Conception de tableaux de bord dynamiques",
    ],
  },
  {
    code: "PBI",
    numero: "Module 2",
    titre: "Power BI",
    duree: "4 jours",
    objectif: "Automatiser la production de rapports professionnels de bout en bout.",
    programme: [
      "Introduction à Power BI et son environnement",
      "Préparation des données avec Power Query",
      "Modélisation des données",
      "Création d'un modèle en étoile",
      "Introduction au langage DAX",
      "Création de mesures simples et composées",
      "Calculs temporels",
      "Création de visualisations",
      "Conception de rapports interactifs",
      "Organisation et ergonomie des tableaux de bord",
      "Publication et partage avec Power BI Service",
    ],
  },
];

/* --- section 4 : les bénéfices ------------------------------------------- */

const BENEFICES = [
  { titre: "Nettoyer et structurer des données", texte: "Reprendre un fichier en l'état et en faire une table exploitable, sans retouche manuelle." },
  { titre: "Automatiser les traitements répétitifs", texte: "Ce qui prenait une matinée chaque mois se rejoue en une actualisation." },
  { titre: "Consolider plusieurs fichiers et sources", texte: "Agences, mois, systèmes : une seule table, actualisable." },
  { titre: "Construire des indicateurs de performance", texte: "Définir un KPI, l'écrire en DAX, et le tenir dans le temps." },
  { titre: "Créer des tableaux de bord dynamiques", texte: "Des vues qui répondent aux filtres, lisibles sans mode d'emploi." },
  { titre: "Analyser et interpréter les résultats", texte: "Passer du chiffre au constat, et du constat à la décision." },
  { titre: "Produire des rapports professionnels", texte: "Sous Excel et sous Power BI, partageables et actualisables." },
];

/* --- section 5 : à qui s'adresse la formation ---------------------------- */

const PROFILS = [
  "Professionnels des services administratifs et financiers",
  "Comptables et contrôleurs de gestion",
  "Responsables RH",
  "Responsables commerciaux",
  "Chargés d'études et statisticiens",
  "Consultants et entrepreneurs",
  "Toute personne souhaitant devenir autonome dans l'analyse de données",
];

const PREREQUIS = [
  "Savoir utiliser un ordinateur",
  "Avoir des bases en Excel",
  "Disposer d'un ordinateur portable fonctionnel",
];

/* --- section 6 : les avantages ------------------------------------------- */

const AVANTAGES = [
  { titre: "Fichiers des ateliers pratiques", texte: "Les classeurs Excel utilisés pendant la formation, à conserver et à réutiliser sur vos propres données." },
  { titre: "Formation complémentaire offerte", texte: "Un accès à une formation sur la structuration et l'analyse de données, en complément des 8 jours." },
  { titre: "Un mois de Power BI University", texte: "Accès gratuit pendant un mois, pour prolonger la pratique après la session." },
  { titre: "Un mois d'accompagnement", texte: "Vos questions sur vos propres fichiers, suivies pendant le mois qui suit la formation." },
  { titre: "Deux certificats de formation", texte: "Un pour Excel, un pour Power BI, vérifiables en ligne sur le registre VIZDATA." },
  { titre: "Une communauté privée d'entraide", texte: "Les participants des cohortes précédentes, et les formateurs." },
];

/* --- section 7 : tarifs --------------------------------------------------
   Montants de repli uniquement : la cohorte publiée fait foi. */

const TARIFS_REPLI = { integral: 500000, echelonne: 600000 };

const INCLUS_COMMUN = [
  "Accès aux 8 jours de formation",
  "Modules Excel et Power BI",
  "Supports pédagogiques",
  "Bonus et accompagnement",
  "Deux certificats de formation",
];

/* --- section 8 : les formateurs -----------------------------------------
   `photo` désigne un fichier à déposer dans public/academie/. Tant qu'il est
   absent, la page affiche les initiales sur un fond de marque : jamais une
   image cassée, jamais un portrait inventé. */

const FORMATEURS = [
  {
    nom: "Fabrice BOH",
    role: "Microsoft MVP Excel",
    photo: "/academie/fabrice-boh.jpg",
    initiales: "FB",
    points: [
      "Microsoft MVP Excel",
      "Formateur et expert Excel",
      "Spécialiste de l'analyse et de la structuration des données",
      "Auteur de livres sur Excel",
    ],
  },
  {
    nom: "Michael KONAN",
    role: "Formateur Power BI",
    photo: "/academie/michael-konan.jpg",
    initiales: "MK",
    points: ["Formateur Power BI"],
    /* Les compétences et l'expérience de Michael KONAN doivent être
       renseignées à partir des informations officielles fournies par VIZDATA.
       Elles ne sont pas inventées ici ; la page n'affiche que ce qui est
       renseigné. */
    aCompleter: "Compétences et expérience à compléter depuis les informations officielles VIZDATA.",
  },
];

/* --- section 10 : questions fréquentes ----------------------------------- */

/** Questions fréquentes. Les montants viennent de la cohorte publiée : une
    FAQ qui annonce un tarif périmé est pire qu'une FAQ absente. */
const faqListe = ({ integral, echelonne }) => [
  {
    q: "Faut-il être informaticien pour participer ?",
    r: "Non. La formation s'adresse à des professionnels qui manipulent des données dans leur métier : gestion, finance, RH, commerce, études. Aucune compétence en programmation n'est demandée.",
  },
  {
    q: "Quel est le niveau Excel requis ?",
    r: "Des bases suffisent : savoir saisir des données, écrire une formule simple, se repérer dans un classeur. Le module Excel part de la structuration des données et monte progressivement jusqu'à Power Query, Power Pivot et DAX.",
  },
  {
    q: "La formation est-elle en ligne ou en présentiel ?",
    r: "En présentiel, à Abidjan, sur 8 jours intensifs. Le format en salle est délibéré : les ateliers se font sur votre machine, avec un formateur qui regarde votre écran.",
  },
  {
    q: "Peut-on payer en deux fois ?",
    r: `Oui. Le paiement intégral est à ${montant(integral)}, le paiement en deux fois à ${montant(echelonne)}, soit deux versements de ${montant(echelonne / 2)}. Les conditions et les échéances du second versement vous sont communiquées avant la validation de votre inscription.`,
  },
  {
    q: "Reçoit-on des certificats ?",
    r: "Deux certificats de formation : Excel et Power BI. Ils sont délivrés par VIZDATA et vérifiables en ligne sur le registre officiel, à partir de leur référence ou du QR code qui y figure.",
  },
  {
    q: "Un ordinateur est-il obligatoire ?",
    r: "Oui. La formation est entièrement pratique : vous travaillez sur votre propre ordinateur portable, avec Excel installé, pour repartir avec un environnement que vous savez utiliser.",
  },
  {
    q: "Quand aura lieu la prochaine session ?",
    r: "Les cohortes sont trimestrielles : une nouvelle session tous les trois mois. Les dates de la prochaine cohorte sont annoncées en haut de cette page dès leur ouverture ; en l'absence de date affichée, écrivez-nous sur WhatsApp pour être prévenu de l'ouverture.",
  },
  {
    q: "Comment confirmer définitivement son inscription ?",
    r: "Déposez votre candidature par le formulaire de cette page. L'équipe VIZDATA vous contacte pour confirmer votre profil, vous communiquer les modalités de paiement et les échéances, puis votre inscription est validée à réception du paiement convenu.",
  },
];

/* --- section 11 : étapes d'inscription ----------------------------------- */

const ETAPES = [
  { titre: "Vous candidatez", texte: "Le formulaire de cette page, en deux minutes." },
  { titre: "Nous vous appelons", texte: "Sur WhatsApp, pour valider votre profil et répondre à vos questions." },
  { titre: "Vous réglez", texte: "Intégralement ou en deux fois, selon la formule choisie." },
  { titre: "Vous êtes inscrit", texte: "Votre place est réservée dans la cohorte, et les informations pratiques vous sont transmises." },
];

export {
  ORGANISME,
  whatsappUrl,
  REPERES,
  DIFFICULTES,
  MODULES,
  BENEFICES,
  PROFILS,
  PREREQUIS,
  AVANTAGES,
  TARIFS_REPLI,
  INCLUS_COMMUN,
  FORMATEURS,
  faqListe,
  ETAPES,
};
