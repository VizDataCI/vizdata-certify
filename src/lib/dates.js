/* Dates et formats français. */

/** Date de référence de la session : sert au calcul des expirations. */
const TODAY = new Date();

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT = ["jan", "fév", "mar", "avr", "mai", "jui", "jul", "aoû", "sep", "oct", "nov", "déc"];

const fmtLong = (d) => {
  if (!d) return "Non datée";
  const dt = new Date(d);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
const fmtShort = (d) => {
  if (!d) return "Non datée";
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
};

/** Date ET heure, pour ce qui se lit à la minute près.
 *
 *  Une session ouverte « le 24/11/2026 » ne dit rien : on en ouvre plusieurs
 *  dans la même journée, et c'est justement l'heure qui permet de reconnaître
 *  la sienne. Le fuseau est celui du lecteur : l'horodatage est en UTC dans la
 *  base, et doit s'afficher à l'heure d'Abidjan pour qui s'y trouve. */
const fmtDateHeure = (d) => {
  if (!d) return "Date inconnue";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "Date inconnue";
  const heure = `${String(dt.getHours()).padStart(2, "0")}h${String(dt.getMinutes()).padStart(2, "0")}`;
  return `${fmtShort(dt)} à ${heure}`;
};

export { TODAY, MONTHS, MONTHS_SHORT, fmtLong, fmtShort, fmtDateHeure };
