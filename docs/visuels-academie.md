# Photographies de la page de vente

La page `/academie` charge ses images depuis `public/academie/`, par leur nom exact.
Tant qu'un fichier est absent, elle affiche un repli de marque : les initiales sur un
dégradé bleu-violet : plutôt qu'une image cassée.

Aucune photographie n'est inventée ni empruntée à une banque d'images. Un portrait qui
ne serait pas celui du formateur serait un mensonge sur une page de vente, et le repli
est préférable.

## Fichiers attendus

| Fichier | Contenu |
| --- | --- |
| `public/academie/fabrice-boh.jpg` | portrait de Fabrice BOH, Microsoft MVP Excel |
| `public/academie/michael-konan.jpg` | portrait de Michael KONAN, formateur Power BI |

Format conseillé : JPEG, cadrage portrait, environ 660 × 800 px, visage dans le tiers
supérieur (la page recadre depuis le haut) et moins de 200 ko, pour ne pas alourdir
une page consultée en grande majorité sur téléphone.

## Ajouter d'autres visuels

Pour des photographies de session, de salle ou d'atelier : les déposer dans le même
dossier et les référencer depuis `src/academie/programme.js`. Le composant `Photo` de
`src/screens/academie/Visuels.jsx` applique le même repli à toutes.

## Ce qui n'est pas une photographie

L'aperçu de tableau de bord du hero est dessiné en SVG, pas capturé en image : il reste
net sur un écran haute densité, il pèse quelques kilo-octets, et il illustre ce que les
participants apprennent à produire sans emprunter la copie d'écran du tableau de bord
de quelqu'un d'autre.

## Le texte de Michael KONAN reste à compléter

`src/academie/programme.js` ne lui attribue qu'une ligne (« Formateur Power BI ») et
la page affiche sous son nom une mention indiquant que ses compétences et son
expérience restent à renseigner depuis les informations officielles de VIZDATA. Elles
n'ont pas été devinées. Compléter le tableau `points` du formateur fait disparaître la
mention.
