/* L'identité de VIZDATA : qui délivre, et comment le joindre.
 *
 * Ces coordonnées vivaient dans le contenu de la page de vente de l'académie,
 * où elles n'avaient rien à faire : l'adresse d'un organisme de formation
 * n'est pas un argument commercial, c'est un fait de l'entreprise. Un
 * titulaire qui veut joindre VIZDATA depuis son espace a besoin des mêmes
 * numéros que le visiteur qui lit la page de vente, et le jour où le numéro
 * change, il ne doit changer qu'ici.
 *
 * Deux adresses, et elles ne servent pas à la même chose : l'une est l'accueil
 * général, l'autre le service formation. Donner les deux évite au titulaire de
 * choisir au hasard et d'attendre une réponse qui ne viendra pas du bon
 * bureau.
 */

const ORGANISME = {
  nom: "VIZDATA",
  site: "https://vizdata.ci/",
  siteAffiche: "vizdata.ci",
  email: "contact@vizdata.ci",
  emailFormation: "vizdata.formation@vizdata.ci",
  /* Le numéro affiché et le numéro technique diffèrent : wa.me n'accepte que
     les chiffres, indicatif compris, sans le « + » ni les espaces. */
  whatsappAffiche: "+225 05 04 38 35 32",
  whatsappLien: "2250504383532",
  lieu: "Abidjan, Côte d'Ivoire",
};

/** Lien WhatsApp, avec un message déjà écrit. */
const whatsappUrl = (message) =>
  `https://wa.me/${ORGANISME.whatsappLien}?text=${encodeURIComponent(message)}`;

/** Lien « mailto », avec objet et corps déjà remplis.
 *
 *  L'objet pré-rempli n'est pas un ornement : un message qui arrive sous
 *  « (sans objet) » attend plus longtemps que les autres. */
const mailtoUrl = (adresse, objet = "", corps = "") => {
  const params = new URLSearchParams();
  if (objet) params.set("subject", objet);
  if (corps) params.set("body", corps);
  const q = params.toString();
  return `mailto:${adresse}${q ? `?${q}` : ""}`;
};

export { ORGANISME, whatsappUrl, mailtoUrl };
