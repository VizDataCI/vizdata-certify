/* Les deux durées de la veille d'inactivité.
 *
 * Elles sont écrites ici ET dans les deux registres — server/comptes.mjs et
 * api/lib/Comptes.php — parce que le navigateur ne peut lire ni l'un ni
 * l'autre. C'est la seule duplication acceptée dans ce produit, et elle est
 * tenue par un test : tests/sessions.test.js compare ce fichier aux constantes
 * du registre et échoue si les deux divergent.
 *
 * Pourquoi pas une valeur servie par l'API : parce qu'il faudrait la demander
 * avant de pouvoir compter, donc avant d'avoir une session — et qu'une
 * déconnexion automatique qui dépend d'un appel réseau ne se déclencherait pas
 * le jour où le réseau tombe, c'est-à-dire exactement quand on l'abandonne.
 */

/** Dix minutes sans un geste, et la session se ferme. */
const INACTIVITE = 600;

/** Les deux dernières minutes sont annoncées, avec le compte à rebours. */
const INACTIVITE_PREAVIS = 120;

export { INACTIVITE, INACTIVITE_PREAVIS };
