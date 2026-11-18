/* Les icônes de l'interface.
 *
 * Un seul endroit, une seule bibliothèque
 * ---------------------------------------
 * Tout vient de Lucide. Mélanger deux jeux d'icônes se voit immédiatement :
 * les épaisseurs de trait diffèrent, les coins aussi, et l'interface prend un
 * air d'assemblage. En passant par ce module, une icône a partout la même
 * taille et la même épaisseur, et on en change partout d'un seul geste.
 *
 * Pourquoi réexporter plutôt qu'importer Lucide directement dans chaque écran :
 * le jour où une icône doit changer de sens (Award pour un certificat plutôt
 * que BadgeCheck, par exemple), la décision se prend ici et vaut pour tous les
 * écrans. Un import direct éparpillerait ce choix dans quinze fichiers.
 *
 * La taille par défaut est 18 px : lisible à côté d'un texte de 13,5 px sans
 * le dominer. L'épaisseur 1.75 tient le milieu entre le trait maigre, qui
 * disparaît sur un écran ordinaire, et le trait gras, qui alourdit.
 */

import {
  LayoutDashboard, Award, Users, GraduationCap, ShieldCheck, ChartNoAxesCombined,
  Settings, Search, History, Download, Printer, Share2, Plus, X, Check, CheckCircle2,
  AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, ChevronRight, ChevronLeft,
  ArrowUpDown, Mail, Phone, Calendar, FileText, Upload, Trash2, Pencil, Eye,
  Link2, QrCode, Ban, RotateCcw, Database, BellRing, Layers, UserPlus, LogOut,
  ClipboardList, CalendarDays, BadgeCheck, Building2, Clock, ExternalLink,
  Copy, Filter, Lock, ServerCog, HardDriveDownload, Menu, Sparkles, MapPin,
} from "lucide-react";

/* Les réglages communs. `strokeWidth` et `size` restent surchargeables au cas
   par cas, mais ne le sont presque jamais : c'est le but. */
const DEFAUTS = { size: 18, strokeWidth: 1.75, "aria-hidden": true };

const enveloppe = (Composant) => {
  const Icone = (p) => <Composant {...DEFAUTS} {...p} />;
  Icone.displayName = Composant.displayName || Composant.name;
  return Icone;
};

/* --- navigation et métier -------------------------------------------------
   Les noms disent la FONCTION, pas le dessin : `IconeCertificats` et non
   `IconeAward`. Changer le dessin ne demande alors de toucher qu'à ce fichier. */
const IconeTableau = enveloppe(LayoutDashboard);
const IconeCertificats = enveloppe(Award);
const IconeCertifies = enveloppe(Users);
const IconeCatalogue = enveloppe(Layers);
const IconeFormations = enveloppe(GraduationCap);
const IconeVerification = enveloppe(ShieldCheck);
const IconeStats = enveloppe(ChartNoAxesCombined);
const IconeParametres = enveloppe(Settings);
const IconeImport = enveloppe(Upload);
const IconeNotifications = enveloppe(BellRing);
const IconeUtilisateurs = enveloppe(UserPlus);
const IconeCandidatures = enveloppe(ClipboardList);
const IconeCohortes = enveloppe(CalendarDays);
const IconeAuthentique = enveloppe(BadgeCheck);
const IconeOrganisme = enveloppe(Building2);
const IconeSauvegarde = enveloppe(Database);
const IconeServeur = enveloppe(ServerCog);
const IconeTelechargerBase = enveloppe(HardDriveDownload);

/* --- actions ---------------------------------------------------------------- */
const IconeRecherche = enveloppe(Search);
const IconeHistorique = enveloppe(History);
const IconeTelecharger = enveloppe(Download);
const IconeImprimer = enveloppe(Printer);
const IconePartager = enveloppe(Share2);
const IconePlus = enveloppe(Plus);
const IconeFermer = enveloppe(X);
const IconeValider = enveloppe(Check);
const IconeModifier = enveloppe(Pencil);
const IconeSupprimer = enveloppe(Trash2);
const IconeVoir = enveloppe(Eye);
const IconeLien = enveloppe(Link2);
const IconeCopier = enveloppe(Copy);
const IconeQr = enveloppe(QrCode);
const IconeRevoquer = enveloppe(Ban);
const IconeRetablir = enveloppe(RotateCcw);
const IconeFiltrer = enveloppe(Filter);
const IconeExterne = enveloppe(ExternalLink);
const IconeDeconnexion = enveloppe(LogOut);
const IconeMenu = enveloppe(Menu);

/* --- états et signaux --------------------------------------------------------- */
const IconeSucces = enveloppe(CheckCircle2);
const IconeAlerte = enveloppe(AlertTriangle);
const IconeErreur = enveloppe(AlertCircle);
const IconeInfo = enveloppe(Info);
const IconeTri = enveloppe(ArrowUpDown);
const IconeBas = enveloppe(ChevronDown);
const IconeHaut = enveloppe(ChevronUp);
const IconeDroite = enveloppe(ChevronRight);
const IconeGauche = enveloppe(ChevronLeft);
const IconeVerrou = enveloppe(Lock);
const IconeEclat = enveloppe(Sparkles);

/* --- champs et données ---------------------------------------------------------- */
const IconeCourriel = enveloppe(Mail);
const IconeTelephone = enveloppe(Phone);
const IconeDate = enveloppe(Calendar);
const IconeHeure = enveloppe(Clock);
const IconeDocument = enveloppe(FileText);
const IconeLieu = enveloppe(MapPin);

export {
  IconeTableau, IconeCertificats, IconeCertifies, IconeCatalogue, IconeFormations,
  IconeVerification, IconeStats, IconeParametres, IconeImport, IconeNotifications,
  IconeUtilisateurs, IconeCandidatures, IconeCohortes, IconeAuthentique, IconeOrganisme,
  IconeSauvegarde, IconeServeur, IconeTelechargerBase,
  IconeRecherche, IconeHistorique, IconeTelecharger, IconeImprimer, IconePartager,
  IconePlus, IconeFermer, IconeValider, IconeModifier, IconeSupprimer, IconeVoir,
  IconeLien, IconeCopier, IconeQr, IconeRevoquer, IconeRetablir, IconeFiltrer,
  IconeExterne, IconeDeconnexion, IconeMenu,
  IconeSucces, IconeAlerte, IconeErreur, IconeInfo, IconeTri, IconeBas, IconeHaut,
  IconeDroite, IconeGauche, IconeVerrou, IconeEclat,
  IconeCourriel, IconeTelephone, IconeDate, IconeHeure, IconeDocument, IconeLieu,
};
