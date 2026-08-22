/* Le lien inscrit dans les QR codes doit rester résoluble.
 *
 * Ce test existe à cause d'un défaut réel : en francisant les adresses, le
 * routage est passé à /verifier/{jeton} tandis que le lien du QR code
 * continuait de pointer vers /verify/{jeton}. Le code était donc correctement
 * encodé, parfaitement lisible, et menait à une page « introuvable ».
 *
 * Sur un certificat imprimé, un tel lien reste faux pour toute la durée de vie
 * du document. On vérifie donc que le chemin encodé est bien celui que le
 * routeur reconnaît, et qu'il rend le jeton intact.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { toPath, toRoute } from "../src/lib/router.js";
import { buildQR } from "../src/lib/qr.js";

const BASE = "https://certify.vizdata.ci";
const JETON = "d926399ce6fb4465a33e";

/** Reproduit la construction du lien telle que l'applique App.jsx. */
const lienDeVerification = (jeton) => BASE + toPath({ view: "verifyResult", token: jeton });

test("le lien encodé mène au verdict de vérification", () => {
  const lien = lienDeVerification(JETON);
  const chemin = new URL(lien).pathname;
  const route = toRoute(chemin);

  assert.equal(route.view, "verifyResult", `le chemin ${chemin} ne mène pas au verdict`);
  assert.equal(route.token, JETON, "le jeton n'est pas restitué intact");
});

test("le lien n'utilise pas l'ancien chemin /verify/", () => {
  assert.ok(!lienDeVerification(JETON).includes("/verify/"), "chemin périmé dans le lien");
});

test("le lien tient dans un QR code", () => {
  const qr = buildQR(lienDeVerification(JETON));
  assert.ok(qr, "le lien ne peut pas être encodé");
  /* Au-delà de la version 10 (57 modules), un code imprimé sur un certificat
     devient trop dense pour être lu confortablement par un téléphone. */
  assert.ok(qr.size <= 57, `code trop dense : ${qr.size} modules`);
});
