/* Contrôle de surface des fichiers PHP du registre.
 *
 *   npm run verifier:php
 *
 * Pourquoi ce script existe
 * -------------------------
 * Le registre tourne en PHP sur l'hébergement, et il n'y a pas d'interpréteur
 * PHP sur la machine de développement. `php -l` n'est donc pas une option, et
 * une faute de frappe ne se révélerait qu'une fois le site en ligne : sous la
 * forme d'une page blanche, parce qu'une erreur d'analyse empêche PHP
 * d'exécuter quoi que ce soit, y compris la gestion d'erreur.
 *
 * Ce que ce script vérifie, et ce qu'il ne vérifie pas
 * ---------------------------------------------------
 * Il lit les fichiers avec un analyseur lexical minimal : il sait reconnaître
 * les chaînes, les heredoc et les commentaires : puis contrôle :
 *
 *   - l'équilibre des accolades, parenthèses et crochets, hors chaînes ;
 *   - qu'aucune chaîne ni aucun commentaire ne reste ouvert en fin de fichier ;
 *   - que le fichier commence par `<?php` ;
 *   - qu'il ne se termine PAS par `?>`. Ce point n'est pas cosmétique : le
 *     moindre octet après `?>` (une ligne vide suffit) est envoyé au
 *     navigateur. Les en-têtes sont alors déjà partis, et poser le cookie de
 *     session échoue. La panne est spectaculaire et l'origine invisible.
 *
 * Il ne remplace PAS `php -l` : il ne connaît pas la grammaire du langage et
 * ne verra pas un `if` sans condition ni un appel mal formé. Il attrape la
 * classe d'erreurs la plus fréquente quand on écrit sans interpréteur, et il
 * le dit plutôt que de laisser croire à une validation complète.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const RACINE = resolve(process.cwd());

/** Tous les .php sous un dossier. */
function fichiersPhp(dossier) {
  const liste = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) liste.push(...fichiersPhp(chemin));
    else if (entree.name.endsWith(".php")) liste.push(chemin);
  }
  return liste;
}

const PAIRES = { ")": "(", "]": "[", "}": "{" };

/**
 * Analyse un fichier. Rend la liste des reproches : vide si tout va bien.
 *
 * L'analyse avance caractère par caractère plutôt que par expressions
 * régulières : une accolade dans une chaîne, un `*​/` dans un commentaire de
 * ligne, un `//` dans une URL : tout cela piège les expressions régulières, et
 * un contrôle qui crie au loup sur du code correct finit par être ignoré, ce
 * qui est pire que pas de contrôle du tout.
 */
function analyser(texte) {
  const reproches = [];
  const pile = [];
  let ligne = 1;
  let i = 0;

  /* `etat` : 'code' | 'ligne' (commentaire //) | 'bloc' (/* … *​/)
     | '"' | "'" | 'heredoc' */
  let etat = "code";
  let marqueur = ""; /* étiquette du heredoc en cours */
  let ouvertureLigne = 0; /* ligne où la chaîne ou le commentaire a commencé */

  while (i < texte.length) {
    const c = texte[i];
    const suivant = texte[i + 1];
    if (c === "\n") ligne++;

    if (etat === "ligne") {
      if (c === "\n") etat = "code";
      i++;
      continue;
    }

    if (etat === "bloc") {
      if (c === "*" && suivant === "/") { etat = "code"; i += 2; continue; }
      i++;
      continue;
    }

    if (etat === "'" || etat === '"') {
      if (c === "\\") { i += 2; continue; }
      if (c === etat) { etat = "code"; i++; continue; }
      i++;
      continue;
    }

    if (etat === "heredoc") {
      /* La fin d'un heredoc est l'étiquette en début de ligne, éventuellement
         indentée depuis PHP 7.3, suivie de ; ou d'une fin de ligne. */
      if (c === "\n") {
        const fin = texte.slice(i + 1).match(/^[ \t]*([A-Za-z_][A-Za-z0-9_]*)/);
        if (fin && fin[1] === marqueur) {
          i += 1 + fin[0].length;
          etat = "code";
          continue;
        }
      }
      i++;
      continue;
    }

    /* --- état « code » --- */
    if (c === "/" && suivant === "/") { etat = "ligne"; i += 2; continue; }
    if (c === "#" && suivant !== "[") { etat = "ligne"; i++; continue; }
    if (c === "/" && suivant === "*") { etat = "bloc"; ouvertureLigne = ligne; i += 2; continue; }
    if (c === "'" || c === '"') { etat = c; ouvertureLigne = ligne; i++; continue; }

    if (c === "<" && texte.startsWith("<<<", i)) {
      const debut = texte.slice(i + 3).match(/^[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
      if (debut) {
        marqueur = debut[2];
        etat = "heredoc";
        ouvertureLigne = ligne;
        i += 3 + debut[0].length;
        continue;
      }
    }

    if (c === "(" || c === "[" || c === "{") { pile.push({ c, ligne }); i++; continue; }

    if (c === ")" || c === "]" || c === "}") {
      const attendu = PAIRES[c];
      const dernier = pile.pop();
      if (!dernier) {
        reproches.push(`ligne ${ligne} : « ${c} » sans ouverture correspondante`);
      } else if (dernier.c !== attendu) {
        reproches.push(
          `ligne ${ligne} : « ${c} » ferme un « ${dernier.c} » ouvert ligne ${dernier.ligne}`
        );
      }
      i++;
      continue;
    }

    i++;
  }

  if (etat === "'" || etat === '"') reproches.push(`chaîne ouverte ligne ${ouvertureLigne} et jamais fermée`);
  if (etat === "bloc") reproches.push(`commentaire ouvert ligne ${ouvertureLigne} et jamais fermé`);
  if (etat === "heredoc") reproches.push(`heredoc « ${marqueur} » ouvert ligne ${ouvertureLigne} et jamais fermé`);

  for (const reste of pile) {
    reproches.push(`« ${reste.c} » ouvert ligne ${reste.ligne} et jamais fermé`);
  }

  return reproches;
}

function controler() {
  const dossier = join(RACINE, "api");
  let total = 0;
  let fautifs = 0;

  try {
    statSync(dossier);
  } catch {
    console.error("\n  Aucun dossier api/ : rien à contrôler.\n");
    return 1;
  }

  for (const chemin of fichiersPhp(dossier)) {
    const texte = readFileSync(chemin, "utf8");
    const nom = relative(RACINE, chemin).replace(/\\/g, "/");
    const reproches = analyser(texte);

    if (!texte.startsWith("<?php")) {
      reproches.push("le fichier ne commence pas par « <?php »");
    }
    if (/\?>\s*$/.test(texte)) {
      reproches.push(
        "le fichier se termine par « ?> » : le moindre octet qui suit part au " +
          "navigateur, et poser le cookie de session échouerait alors"
      );
    }
    if (!/^declare\(strict_types=1\);$/m.test(texte)) {
      reproches.push("« declare(strict_types=1); » manquant");
    }

    total++;
    if (reproches.length) {
      fautifs++;
      console.log(`\n  ${nom}`);
      for (const r of reproches) console.log(`   , ${r}`);
    }
  }

  if (fautifs === 0) {
    console.log(`\n  ${total} fichiers PHP : délimiteurs équilibrés, chaînes fermées, pas de « ?> » final.`);
    console.log(`  Ce contrôle ne remplace pas « php -l » : il ne connaît pas la grammaire\n  du langage. Le vrai verdict vient du serveur.\n`);
    return 0;
  }

  console.log(`\n  ${fautifs} fichier(s) sur ${total} à corriger avant tout téléversement.\n`);
  return 1;
}

process.exitCode = controler();
