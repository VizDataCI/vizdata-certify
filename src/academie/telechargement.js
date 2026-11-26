/* Téléchargement d'un fichier produit dans le navigateur.
 *
 * Isolé pour une raison pratique : exporté depuis un module d'écran, il
 * empêchait le rechargement à chaud de React : un fichier qui exporte autre
 * chose que des composants perd cette propriété.
 */

/** Propose un fichier au téléchargement, sans passer par le serveur. */
function telecharger(nom, contenu, type = "text/csv;charset=utf-8") {
  const lien = document.createElement("a");
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  /* Libérer l'URL trop tôt annule le téléchargement sur Safari. */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { telecharger };
